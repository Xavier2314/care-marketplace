import request from 'supertest';
import bcrypt from 'bcryptjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

const app = createApp({ rateLimits: false });
const api = () => request(app);

async function register(role: 'PATIENT' | 'PROVIDER', email: string) {
  const res = await api().post('/api/auth/register').send({ email, password: 'Password123', name: `Test ${role}`, country: 'NG', role });
  expect(res.status).toBe(201);
  return res.body.token as string;
}

function tomorrowAt(hourUtc: number, plusDays = 1) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + plusDays);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

describe('care marketplace booking flow', () => {
  let adminToken: string;
  let providerToken: string;
  let patientToken: string;
  let otherPatientToken: string;
  let providerId: string;
  let homeServiceId: string;
  let virtualServiceId: string;
  let credentialId: string;

  beforeAll(async () => {
    await prisma.user.create({
      data: { email: 'admin@test.dev', name: 'Admin', role: 'ADMIN', country: 'GB', passwordHash: await bcrypt.hash('Password123', 4) },
    });
    adminToken = (await api().post('/api/auth/login').send({ email: 'admin@test.dev', password: 'Password123' })).body.token;
    providerToken = await register('PROVIDER', 'nurse@test.dev');
    patientToken = await register('PATIENT', 'patient@test.dev');
    otherPatientToken = await register('PATIENT', 'other@test.dev');
  });

  it('rejects public self-registration as admin', async () => {
    const res = await api().post('/api/auth/register').send({ email: 'x@test.dev', password: 'Password123', name: 'X', country: 'NG', role: 'ADMIN' });
    expect(res.status).toBe(400);
  });

  it('lets a provider build a profile within their professional scope', async () => {
    const auth = { Authorization: `Bearer ${providerToken}` };
    const profile = await api().put('/api/provider/me').set(auth).send({
      profession: 'NURSE', headline: 'Home nurse in Lagos', languages: ['English'], yearsExperience: 5,
      country: 'ng', city: 'Lagos', timezone: 'UTC',
    });
    expect(profile.status).toBe(200);
    providerId = profile.body.id;

    const physio = await api().post('/api/provider/me/services').set(auth).send({
      category: 'PHYSIOTHERAPY', title: 'Physio', mode: 'HOME', pricingType: 'FIXED', priceMinor: 1000, currency: 'NGN', durationMinutes: 60,
    });
    expect(physio.status).toBe(400); // nurses cannot offer physiotherapy

    const submitEarly = await api().post('/api/provider/me/submit').set(auth);
    expect(submitEarly.status).toBe(400);

    const home = await api().post('/api/provider/me/services').set(auth).send({
      category: 'HOME_CARE', title: 'Home nursing', mode: 'HOME', pricingType: 'HOURLY', priceMinor: 10000, currency: 'NGN', durationMinutes: 60,
    });
    expect(home.status).toBe(201);
    homeServiceId = home.body.id;

    const virtual = await api().post('/api/provider/me/services').set(auth).send({
      category: 'TELEHEALTH', title: 'Video check-in', mode: 'VIRTUAL', pricingType: 'FIXED', priceMinor: 5000, currency: 'NGN', durationMinutes: 30,
    });
    expect(virtual.status).toBe(201);
    virtualServiceId = virtual.body.id;

    const cred = await api().post('/api/provider/me/credentials').set(auth).send({
      type: 'Nursing licence', issuingBody: 'NMCN', number: 'RN-1', country: 'NG', expiresAt: new Date(Date.now() + 365 * 86400_000),
    });
    expect(cred.status).toBe(201);
    credentialId = cred.body.id;

    const slots = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 8 * 60, endMinute: 20 * 60 }));
    expect((await api().put('/api/provider/me/availability').set(auth).send(slots)).status).toBe(200);
    expect((await api().post('/api/provider/me/submit').set(auth)).body.verificationStatus).toBe('PENDING');
  });

  it('keeps unverified providers out of search', async () => {
    const res = await api().get('/api/providers').query({ country: 'NG' });
    expect(res.body.find((p: { id: string }) => p.id === providerId)).toBeUndefined();
  });

  it('requires an approved credential before verification', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const early = await api().post(`/api/admin/providers/${providerId}/decision`).set(auth).send({ decision: 'VERIFIED' });
    expect(early.status).toBe(409);
    await api().post(`/api/admin/credentials/${credentialId}/review`).set(auth).send({ decision: 'APPROVED' }).expect(200);
    await api().post(`/api/admin/providers/${providerId}/decision`).set(auth).send({ decision: 'VERIFIED' }).expect(200);

    const search = await api().get('/api/providers').query({ country: 'NG', city: 'lagos', category: 'HOME_CARE' });
    expect(search.body.map((p: { id: string }) => p.id)).toContain(providerId);
  });

  it('blocks non-admins from the admin API', async () => {
    await api().get('/api/admin/stats').set({ Authorization: `Bearer ${patientToken}` }).expect(403);
  });

  let bookingId: string;

  it('validates bookings against availability, address and consent', async () => {
    const auth = { Authorization: `Bearer ${patientToken}` };
    const outside = await api().post('/api/bookings').set(auth).send({
      serviceId: homeServiceId, startAt: tomorrowAt(22), address: '1 Marina', careRecipientName: 'Mum',
    });
    expect(outside.status).toBe(409);

    const noAddress = await api().post('/api/bookings').set(auth).send({ serviceId: homeServiceId, startAt: tomorrowAt(10), careRecipientName: 'Mum' });
    expect(noAddress.status).toBe(400);

    const noConsent = await api().post('/api/bookings').set(auth).send({ serviceId: virtualServiceId, startAt: tomorrowAt(10), careRecipientName: 'Me' });
    expect(noConsent.status).toBe(400);
  });

  it('prices hourly bookings by duration and holds payment', async () => {
    const res = await api().post('/api/bookings').set({ Authorization: `Bearer ${patientToken}` }).send({
      serviceId: homeServiceId, startAt: tomorrowAt(10), durationMinutes: 180, address: '1 Marina, Lagos', careRecipientName: 'Mum',
    });
    expect(res.status).toBe(201);
    const [booking] = res.body;
    bookingId = booking.id;
    expect(booking.priceMinor).toBe(30000);
    expect(booking.platformFeeMinor).toBe(4500);
    const payment = await prisma.payment.findUnique({ where: { bookingId } });
    expect(payment?.status).toBe('AUTHORIZED');
  });

  it('prevents double-booking the same professional', async () => {
    const res = await api().post('/api/bookings').set({ Authorization: `Bearer ${otherPatientToken}` }).send({
      serviceId: virtualServiceId, startAt: tomorrowAt(11), careRecipientName: 'Me', telehealthConsent: true,
    });
    expect(res.status).toBe(409);
  });

  it('hides other people\'s bookings and contact details before acceptance', async () => {
    await api().get(`/api/bookings/${bookingId}`).set({ Authorization: `Bearer ${otherPatientToken}` }).expect(403);
    const own = await api().get(`/api/bookings/${bookingId}`).set({ Authorization: `Bearer ${patientToken}` });
    expect(own.body.provider.user.phone).toBeNull();
  });

  it('runs the visit lifecycle through to payout and review', async () => {
    const provider = { Authorization: `Bearer ${providerToken}` };
    const patient = { Authorization: `Bearer ${patientToken}` };

    await api().post(`/api/bookings/${bookingId}/accept`).set(patient).expect(403);
    const accepted = await api().post(`/api/bookings/${bookingId}/accept`).set(provider).expect(200);
    expect(accepted.body.checklist.length).toBeGreaterThan(0);

    await api().post(`/api/bookings/${bookingId}/start`).set(provider).expect(409); // too early
    await prisma.booking.update({ where: { id: bookingId }, data: { startAt: new Date(Date.now() + 10 * 60_000) } });
    await api().post(`/api/bookings/${bookingId}/start`).set(provider).expect(200);
    await api().post(`/api/bookings/${bookingId}/messages`).set(patient).send({ body: 'Gate code is 1234' }).expect(201);

    await api().post(`/api/bookings/${bookingId}/review`).set(patient).send({ rating: 5 }).expect(409); // not completed yet
    await api().post(`/api/bookings/${bookingId}/complete`).set(provider).send({ visitNotes: 'All tasks done' }).expect(200);

    const payment = await prisma.payment.findUnique({ where: { bookingId } });
    expect(payment?.status).toBe('CAPTURED');
    const payouts = await api().get('/api/provider/me/payouts').set(provider);
    expect(payouts.body[0].amountMinor).toBe(25500);

    await api().post(`/api/bookings/${bookingId}/review`).set(patient).send({ rating: 4, comment: 'Kind and punctual' }).expect(201);
    await api().post(`/api/bookings/${bookingId}/review`).set(patient).send({ rating: 5 }).expect(409);
    const profile = await prisma.providerProfile.findUnique({ where: { id: providerId } });
    expect(profile?.ratingAvg).toBe(4);
    expect(profile?.ratingCount).toBe(1);
  });

  it('books recurring care and refunds fully when cancelled early', async () => {
    const patient = { Authorization: `Bearer ${patientToken}` };
    const res = await api().post('/api/bookings').set(patient).send({
      serviceId: homeServiceId, startAt: tomorrowAt(14, 3), address: '1 Marina', careRecipientName: 'Mum', repeatWeeks: 3,
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(3);
    expect(new Set(res.body.map((b: { recurrenceGroupId: string }) => b.recurrenceGroupId)).size).toBe(1);

    const cancel = await api().post(`/api/bookings/${res.body[0].id}/cancel`).set(patient).send({ reason: 'Plans changed' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.refundMinor).toBe(10000);
  });

  it('gives a partial refund and a provider payout for late cancellations', async () => {
    const patient = { Authorization: `Bearer ${patientToken}` };
    const [booking] = (
      await api().post('/api/bookings').set(patient).send({
        serviceId: homeServiceId, startAt: tomorrowAt(16, 5), durationMinutes: 120, address: '1 Marina', careRecipientName: 'Mum',
      })
    ).body;
    await api().post(`/api/bookings/${booking.id}/accept`).set({ Authorization: `Bearer ${providerToken}` }).expect(200);
    await prisma.booking.update({ where: { id: booking.id }, data: { startAt: new Date(Date.now() + 3 * 3600_000) } });

    const cancel = await api().post(`/api/bookings/${booking.id}/cancel`).set(patient);
    expect(cancel.body.refundMinor).toBe(10000); // 50% of 20000
    const payout = await prisma.payout.findUnique({ where: { bookingId: booking.id } });
    expect(payout?.amountMinor).toBe(8500); // 10000 retained minus 15% fee
  });

  it('removes providers from search when their only credential expires', async () => {
    await prisma.credential.update({ where: { id: credentialId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const search = await api().get('/api/providers').query({ country: 'NG' });
    expect(search.body.map((p: { id: string }) => p.id)).not.toContain(providerId);
    const book = await api().post('/api/bookings').set({ Authorization: `Bearer ${patientToken}` }).send({
      serviceId: virtualServiceId, startAt: tomorrowAt(12, 6), careRecipientName: 'Me', telehealthConsent: true,
    });
    expect(book.status).toBe(409);
  });

  it('notifies admins about safety reports', async () => {
    await api()
      .post('/api/complaints')
      .set({ Authorization: `Bearer ${patientToken}` })
      .send({ bookingId, category: 'SAFETY', description: 'Professional arrived and seemed unwell.' })
      .expect(201);
    const notes = await api().get('/api/notifications').set({ Authorization: `Bearer ${adminToken}` });
    expect(notes.body.some((n: { title: string }) => n.title === 'Safety report received')).toBe(true);
  });
});
