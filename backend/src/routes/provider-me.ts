import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { parse } from '../lib/validate';
import { audit } from '../lib/audit';
import { badRequest, conflict, notFound } from '../lib/errors';
import { isServiceAllowed } from '../lib/scope';
import { isValidTimeZone } from '../services/availability';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';

/** Provider self-service: profile, credentials, services, availability, bookings and payouts. */
const router = Router();
router.use(requireAuth, requireRole('PROVIDER'));

async function myProfile(userId: string) {
  const profile = await prisma.providerProfile.findUnique({ where: { userId } });
  if (!profile) throw notFound('Create your professional profile first');
  return profile;
}

router.get('/', async (req, res) => {
  const profile = await prisma.providerProfile.findUnique({
    where: { userId: currentUser(req).id },
    include: {
      credentials: { orderBy: { createdAt: 'desc' } },
      services: { orderBy: { createdAt: 'asc' } },
      availability: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] },
    },
  });
  res.json(profile);
});

const profileSchema = z.object({
  profession: z.enum(['CAREGIVER', 'NURSE', 'DOCTOR', 'PHYSIOTHERAPIST']),
  headline: z.string().trim().min(5).max(120),
  bio: z.string().max(3000).default(''),
  specialties: z.array(z.string().trim().min(1)).max(20).default([]),
  languages: z.array(z.string().trim().min(1)).min(1).max(10),
  yearsExperience: z.number().int().min(0).max(70),
  country: z.string().length(2).transform((c) => c.toUpperCase()),
  city: z.string().trim().min(1),
  serviceArea: z.string().max(300).default(''),
  timezone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
});

router.put('/', async (req, res) => {
  const user = currentUser(req);
  const data = parse(profileSchema, req.body);
  const existing = await prisma.providerProfile.findUnique({ where: { userId: user.id } });
  // Changing profession changes professional scope, so it requires a fresh review.
  const reverify = existing && existing.profession !== data.profession && existing.verificationStatus === 'VERIFIED';
  const profile = await prisma.providerProfile.upsert({
    where: { userId: user.id },
    create: { ...data, userId: user.id },
    update: { ...data, ...(reverify && { verificationStatus: 'PENDING' as const }) },
  });
  if (reverify) await prisma.service.updateMany({ where: { providerId: profile.id }, data: { active: false } });
  await audit(user.id, existing ? 'provider.updated' : 'provider.created', 'ProviderProfile', profile.id, { reverify: !!reverify });
  res.json(profile);
});

router.post('/submit', async (req, res) => {
  const user = currentUser(req);
  const profile = await prisma.providerProfile.findUnique({
    where: { userId: user.id },
    include: { _count: { select: { credentials: true, services: true, availability: true } } },
  });
  if (!profile) throw notFound('Create your professional profile first');
  if (!['DRAFT', 'REJECTED'].includes(profile.verificationStatus)) throw conflict(`Profile is ${profile.verificationStatus.toLowerCase()}`);
  const missing = [
    !profile._count.credentials && 'at least one credential',
    !profile._count.services && 'at least one service',
    !profile._count.availability && 'your availability',
  ].filter(Boolean);
  if (missing.length) throw badRequest(`Add ${missing.join(', ')} before submitting`);
  const updated = await prisma.providerProfile.update({ where: { id: profile.id }, data: { verificationStatus: 'PENDING', reviewNote: null } });
  await audit(user.id, 'provider.submitted', 'ProviderProfile', profile.id);
  res.json(updated);
});

const credentialSchema = z.object({
  type: z.string().trim().min(2),
  issuingBody: z.string().trim().min(2),
  number: z.string().trim().min(1),
  country: z.string().length(2).transform((c) => c.toUpperCase()),
  expiresAt: z.coerce.date().optional(),
  documentUrl: z.url().optional(),
});

router.post('/credentials', async (req, res) => {
  const user = currentUser(req);
  const profile = await myProfile(user.id);
  const data = parse(credentialSchema, req.body);
  if (data.expiresAt && data.expiresAt < new Date()) throw badRequest('This credential has already expired');
  const credential = await prisma.credential.create({ data: { ...data, providerId: profile.id } });
  await audit(user.id, 'credential.added', 'Credential', credential.id);
  res.status(201).json(credential);
});

router.delete('/credentials/:id', async (req, res) => {
  const profile = await myProfile(currentUser(req).id);
  const { count } = await prisma.credential.deleteMany({ where: { id: req.params.id, providerId: profile.id, status: { not: 'APPROVED' } } });
  if (!count) throw notFound('Credential not found, or already approved (approved credentials can only be removed by support)');
  res.status(204).end();
});

const serviceSchema = z.object({
  category: z.enum(['HOME_CARE', 'PHYSIOTHERAPY', 'TELEHEALTH']),
  title: z.string().trim().min(3).max(120),
  description: z.string().max(2000).default(''),
  mode: z.enum(['HOME', 'CLINIC', 'VIRTUAL']),
  pricingType: z.enum(['FIXED', 'HOURLY']),
  priceMinor: z.number().int().positive(),
  currency: z.string().length(3).transform((c) => c.toUpperCase()),
  durationMinutes: z.number().int().min(15).max(24 * 60),
  active: z.boolean().default(true),
});

router.post('/services', async (req, res) => {
  const user = currentUser(req);
  const profile = await myProfile(user.id);
  const data = parse(serviceSchema, req.body);
  if (!isServiceAllowed(profile.profession, data.category, data.mode)) {
    throw badRequest(`A ${profile.profession.toLowerCase()} cannot offer ${data.category.toLowerCase().replace('_', ' ')} (${data.mode.toLowerCase()})`);
  }
  const service = await prisma.service.create({ data: { ...data, providerId: profile.id } });
  await audit(user.id, 'service.created', 'Service', service.id);
  res.status(201).json(service);
});

router.put('/services/:id', async (req, res) => {
  const user = currentUser(req);
  const profile = await myProfile(user.id);
  const data = parse(serviceSchema, req.body);
  if (!isServiceAllowed(profile.profession, data.category, data.mode)) throw badRequest('This service is outside your professional scope');
  const existing = await prisma.service.findFirst({ where: { id: req.params.id, providerId: profile.id } });
  if (!existing) throw notFound('Service not found');
  // Existing bookings keep the price they were made at.
  const service = await prisma.service.update({ where: { id: existing.id }, data });
  await audit(user.id, 'service.updated', 'Service', service.id);
  res.json(service);
});

const availabilitySchema = z
  .array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      startMinute: z.number().int().min(0).max(1439),
      endMinute: z.number().int().min(1).max(1440),
    }),
  )
  .max(50)
  .refine((slots) => slots.every((s) => s.endMinute > s.startMinute), 'Each slot must end after it starts');

router.put('/availability', async (req, res) => {
  const profile = await myProfile(currentUser(req).id);
  const slots = parse(availabilitySchema, req.body);
  await prisma.$transaction([
    prisma.availabilitySlot.deleteMany({ where: { providerId: profile.id } }),
    prisma.availabilitySlot.createMany({ data: slots.map((s) => ({ ...s, providerId: profile.id })) }),
  ]);
  res.json(await prisma.availabilitySlot.findMany({ where: { providerId: profile.id }, orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] }));
});

router.get('/payouts', async (req, res) => {
  const profile = await myProfile(currentUser(req).id);
  const payouts = await prisma.payout.findMany({
    where: { providerId: profile.id },
    orderBy: { createdAt: 'desc' },
    include: { booking: { select: { startAt: true, careRecipientName: true, service: { select: { title: true } } } } },
  });
  res.json(payouts);
});

export default router;
