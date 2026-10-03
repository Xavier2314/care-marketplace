import { randomBytes, randomUUID } from 'crypto';
import { Booking, BookingStatus, Payment, Prisma, ServiceCategory } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { config } from '../lib/config';
import { audit, notify } from '../lib/audit';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { AuthUser } from '../middleware/auth';
import { getGateway } from './payments';
import { bookingPrice, platformFee } from './money';
import { fitsAvailability } from './availability';

const ACTIVE_STATUSES: BookingStatus[] = ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS'];
const HOUR = 60 * 60 * 1000;

/** A provider is bookable when verified and holding at least one approved, unexpired credential. */
export function bookableProviderWhere(now = new Date()): Prisma.ProviderProfileWhereInput {
  return {
    verificationStatus: 'VERIFIED',
    user: { suspended: false },
    credentials: {
      some: { status: 'APPROVED', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    },
  };
}

const DEFAULT_CHECKLIST: Record<ServiceCategory, string[]> = {
  HOME_CARE: ['Confirm identity of care recipient', 'Review care needs and preferences', 'Complete agreed tasks', 'Check home safety concerns'],
  PHYSIOTHERAPY: ['Review pain and mobility since last session', 'Complete exercises', 'Agree home exercise plan'],
  TELEHEALTH: ['Confirm identity and consent', 'Discuss concern', 'Agree follow-up or referral'],
};

export interface CreateBookingInput {
  serviceId: string;
  startAt: Date;
  durationMinutes?: number;
  address?: string;
  careRecipientName: string;
  notes?: string;
  telehealthConsent?: boolean;
  /** Book the same slot weekly for this many weeks in total (recurring care). */
  repeatWeeks?: number;
}

export async function createBookings(patient: AuthUser, input: CreateBookingInput) {
  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
    include: { provider: { include: { availability: true, user: true } } },
  });
  if (!service || !service.active) throw notFound('Service not found');
  const provider = service.provider;

  const bookable = await prisma.providerProfile.count({ where: { id: provider.id, ...bookableProviderWhere() } });
  if (!bookable) throw conflict('This professional is not currently available for booking');
  if (provider.userId === patient.id) throw badRequest('You cannot book your own service');

  const minutes = service.pricingType === 'FIXED' ? service.durationMinutes : input.durationMinutes ?? service.durationMinutes;
  if (minutes < service.durationMinutes) throw badRequest(`Minimum booking length is ${service.durationMinutes} minutes`);
  if (service.mode === 'HOME' && !input.address?.trim()) throw badRequest('An address is required for home visits');
  if (service.mode === 'VIRTUAL' && !input.telehealthConsent) throw badRequest('Consent is required for virtual consultations');

  const weeks = input.repeatWeeks ?? 1;
  const starts = Array.from({ length: weeks }, (_, i) => new Date(input.startAt.getTime() + i * 7 * 24 * HOUR));
  const now = Date.now();

  for (const start of starts) {
    const end = new Date(start.getTime() + minutes * 60_000);
    if (start.getTime() < now + HOUR) throw badRequest('Bookings must start at least one hour from now');
    if (!fitsAvailability(provider.availability, start, end, provider.timezone)) {
      throw conflict(`${start.toISOString()} is outside this professional's availability`);
    }
    const overlap = await prisma.booking.count({
      where: { providerId: provider.id, status: { in: ACTIVE_STATUSES }, startAt: { lt: end }, endAt: { gt: start } },
    });
    if (overlap) throw conflict(`${start.toISOString()} is already booked`);
  }

  const price = bookingPrice(service.pricingType, service.priceMinor, minutes);
  const fee = platformFee(price);
  const gateway = getGateway(config.paymentGateway);
  const recurrenceGroupId = weeks > 1 ? randomUUID() : null;

  const bookings: Booking[] = [];
  for (const start of starts) {
    const bookingId = randomUUID();
    // Funds are held (authorized) now and only captured once the visit is completed.
    const { externalId } = await gateway.authorize({ amountMinor: price, currency: service.currency, reference: bookingId });
    const booking = await prisma.$transaction(async (tx) => {
      const b = await tx.booking.create({
        data: {
          id: bookingId,
          patientId: patient.id,
          providerId: provider.id,
          serviceId: service.id,
          recurrenceGroupId,
          startAt: start,
          endAt: new Date(start.getTime() + minutes * 60_000),
          mode: service.mode,
          address: service.mode === 'VIRTUAL' ? null : input.address,
          careRecipientName: input.careRecipientName,
          notes: input.notes ?? '',
          priceMinor: price,
          platformFeeMinor: fee,
          currency: service.currency,
          telehealthConsent: !!input.telehealthConsent,
          payment: {
            create: { gateway: gateway.name, externalId, amountMinor: price, currency: service.currency, status: 'AUTHORIZED' },
          },
        },
      });
      await audit(patient.id, 'booking.created', 'Booking', b.id, { price, currency: service.currency }, tx);
      await notify(provider.userId, 'New booking request', `${patient.name} requested "${service.title}"`, `/bookings/${b.id}`, tx);
      return b;
    });
    bookings.push(booking);
  }
  return bookings;
}

type BookingWithParties = Booking & { payment: Payment | null; provider: { userId: string }; service: { category: ServiceCategory; title: string } };

async function loadBooking(id: string): Promise<BookingWithParties> {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { payment: true, provider: { select: { userId: true } }, service: { select: { category: true, title: true } } },
  });
  if (!booking) throw notFound('Booking not found');
  return booking;
}

export function isParticipant(booking: { patientId: string; provider: { userId: string } }, user: AuthUser) {
  return booking.patientId === user.id || booking.provider.userId === user.id;
}

function assertProvider(booking: BookingWithParties, user: AuthUser) {
  if (booking.provider.userId !== user.id) throw forbidden('Only the booked professional can do this');
}

function assertStatus(booking: Booking, ...allowed: BookingStatus[]) {
  if (!allowed.includes(booking.status)) throw conflict(`Booking is ${booking.status.toLowerCase()}`);
}

export async function acceptBooking(id: string, user: AuthUser) {
  const booking = await loadBooking(id);
  assertProvider(booking, user);
  assertStatus(booking, 'REQUESTED');
  const videoRoomUrl =
    booking.mode === 'VIRTUAL' ? `${config.videoBaseUrl}/care-${randomBytes(12).toString('hex')}` : null;
  const checklist = DEFAULT_CHECKLIST[booking.service.category].map((label) => ({ label, done: false }));
  return prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({ where: { id }, data: { status: 'ACCEPTED', videoRoomUrl, checklist } });
    await audit(user.id, 'booking.accepted', 'Booking', id, {}, tx);
    await notify(booking.patientId, 'Booking confirmed', `Your booking for "${booking.service.title}" was accepted`, `/bookings/${id}`, tx);
    return updated;
  });
}

export async function declineBooking(id: string, user: AuthUser, reason?: string) {
  const booking = await loadBooking(id);
  assertProvider(booking, user);
  assertStatus(booking, 'REQUESTED');
  await getGateway(booking.payment!.gateway).void(booking.payment!.externalId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({ where: { id }, data: { status: 'DECLINED', cancelReason: reason, cancelledById: user.id } });
    await tx.payment.update({ where: { bookingId: id }, data: { status: 'REFUNDED', refundedMinor: booking.priceMinor } });
    await audit(user.id, 'booking.declined', 'Booking', id, { reason }, tx);
    await notify(booking.patientId, 'Booking declined', `Your request for "${booking.service.title}" was declined. Your payment hold has been released.`, `/bookings/${id}`, tx);
    return updated;
  });
}

/** Refund owed to the patient when a booking is cancelled. */
export function cancellationRefund(booking: Pick<Booking, 'status' | 'startAt' | 'priceMinor'>, byProvider: boolean, now = new Date()) {
  if (byProvider || booking.status === 'REQUESTED') return booking.priceMinor;
  const hoursUntilStart = (booking.startAt.getTime() - now.getTime()) / HOUR;
  if (hoursUntilStart >= config.lateCancelHours) return booking.priceMinor;
  return Math.round((booking.priceMinor * config.lateCancelRefundPercent) / 100);
}

export async function cancelBooking(id: string, user: AuthUser, reason?: string) {
  const booking = await loadBooking(id);
  const isAdmin = user.role === 'ADMIN';
  if (!isAdmin && !isParticipant(booking, user)) throw forbidden();
  assertStatus(booking, 'REQUESTED', 'ACCEPTED');

  const byProvider = isAdmin || booking.provider.userId === user.id;
  const refund = cancellationRefund(booking, byProvider);
  const retained = booking.priceMinor - refund;
  const payment = booking.payment!;
  const gateway = getGateway(payment.gateway);
  if (retained > 0) await gateway.capture(payment.externalId, retained);
  else await gateway.void(payment.externalId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason, cancelledById: user.id } });
    await tx.payment.update({
      where: { bookingId: id },
      data: { status: retained > 0 ? 'PARTIALLY_REFUNDED' : 'REFUNDED', refundedMinor: refund },
    });
    if (retained > 0) {
      // Late-cancellation fee: the provider is compensated for the reserved slot.
      await tx.payout.create({
        data: { providerId: booking.providerId, bookingId: id, amountMinor: retained - platformFee(retained), currency: booking.currency },
      });
    }
    await audit(user.id, 'booking.cancelled', 'Booking', id, { reason, refund, byProvider }, tx);
    const other = booking.patientId === user.id ? booking.provider.userId : booking.patientId;
    await notify(other, 'Booking cancelled', `"${booking.service.title}" on ${booking.startAt.toUTCString()} was cancelled`, `/bookings/${id}`, tx);
    return { booking: updated, refundMinor: refund };
  });
}

/** Provider confirms arrival (home/clinic) or joins the call (virtual). */
export async function startBooking(id: string, user: AuthUser, now = new Date()) {
  const booking = await loadBooking(id);
  assertProvider(booking, user);
  assertStatus(booking, 'ACCEPTED');
  if (now.getTime() < booking.startAt.getTime() - HOUR) throw conflict('Visits can be started at most one hour early');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({ where: { id }, data: { status: 'IN_PROGRESS', arrivedAt: now } });
    await audit(user.id, 'booking.started', 'Booking', id, {}, tx);
    await notify(booking.patientId, booking.mode === 'VIRTUAL' ? 'Your professional has joined' : 'Your professional has arrived', booking.service.title, `/bookings/${id}`, tx);
    return updated;
  });
}

export async function updateChecklist(id: string, user: AuthUser, checklist: { label: string; done: boolean }[]) {
  const booking = await loadBooking(id);
  assertProvider(booking, user);
  assertStatus(booking, 'ACCEPTED', 'IN_PROGRESS');
  return prisma.booking.update({ where: { id }, data: { checklist } });
}

export async function completeBooking(id: string, user: AuthUser, visitNotes?: string) {
  const booking = await loadBooking(id);
  assertProvider(booking, user);
  assertStatus(booking, 'IN_PROGRESS');
  const payment = booking.payment!;
  await getGateway(payment.gateway).capture(payment.externalId, booking.priceMinor);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date(), visitNotes } });
    await tx.payment.update({ where: { bookingId: id }, data: { status: 'CAPTURED' } });
    await tx.payout.create({
      data: { providerId: booking.providerId, bookingId: id, amountMinor: booking.priceMinor - booking.platformFeeMinor, currency: booking.currency },
    });
    await audit(user.id, 'booking.completed', 'Booking', id, {}, tx);
    await notify(booking.patientId, 'Visit completed', `How was "${booking.service.title}"? Leave a review.`, `/bookings/${id}`, tx);
    return updated;
  });
}

export async function reviewBooking(id: string, user: AuthUser, rating: number, comment = '') {
  const booking = await loadBooking(id);
  if (booking.patientId !== user.id) throw forbidden('Only the patient can review this booking');
  assertStatus(booking, 'COMPLETED');
  const existing = await prisma.review.findUnique({ where: { bookingId: id } });
  if (existing) throw conflict('This booking has already been reviewed');
  return prisma.$transaction(async (tx) => {
    const review = await tx.review.create({ data: { bookingId: id, rating, comment } });
    const agg = await tx.review.aggregate({ where: { booking: { providerId: booking.providerId } }, _avg: { rating: true }, _count: true });
    await tx.providerProfile.update({
      where: { id: booking.providerId },
      data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count },
    });
    return review;
  });
}

export async function getBookingFor(id: string, user: AuthUser) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      service: true,
      payment: true,
      payout: true,
      review: true,
      patient: { select: { id: true, name: true, phone: true } },
      provider: { include: { user: { select: { id: true, name: true, phone: true } } } },
      messages: { orderBy: { createdAt: 'asc' }, include: { sender: { select: { id: true, name: true } } } },
      complaints: { where: user.role === 'ADMIN' ? {} : { reporterId: user.id } },
    },
  });
  if (!booking) throw notFound('Booking not found');
  if (user.role !== 'ADMIN' && !isParticipant(booking, user)) throw forbidden();
  // Contact details and the video link are only shared once the provider has accepted.
  const confirmed = ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(booking.status);
  if (!confirmed && user.role !== 'ADMIN') {
    booking.patient.phone = null;
    booking.provider.user.phone = null;
    booking.videoRoomUrl = null;
  }
  return booking;
}

export async function postMessage(id: string, user: AuthUser, body: string) {
  const booking = await loadBooking(id);
  if (!isParticipant(booking, user)) throw forbidden();
  const message = await prisma.message.create({ data: { bookingId: id, senderId: user.id, body } });
  const other = booking.patientId === user.id ? booking.provider.userId : booking.patientId;
  await notify(other, `New message from ${user.name}`, body.slice(0, 120), `/bookings/${id}`);
  return message;
}
