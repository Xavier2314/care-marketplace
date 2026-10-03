import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { parse } from '../lib/validate';
import { notFound } from '../lib/errors';
import { bookableProviderWhere } from '../services/bookings';

const router = Router();

const searchSchema = z.object({
  category: z.enum(['HOME_CARE', 'PHYSIOTHERAPY', 'TELEHEALTH']).optional(),
  mode: z.enum(['HOME', 'CLINIC', 'VIRTUAL']).optional(),
  profession: z.enum(['CAREGIVER', 'NURSE', 'DOCTOR', 'PHYSIOTHERAPIST']).optional(),
  country: z.string().length(2).optional(),
  city: z.string().optional(),
  language: z.string().optional(),
  q: z.string().optional(),
  currency: z.string().length(3).optional(),
  maxPrice: z.coerce.number().int().positive().optional(), // minor units
  weekday: z.coerce.number().int().min(0).max(6).optional(),
  sort: z.enum(['rating', 'price', 'experience']).default('rating'),
});

const PUBLIC_PROVIDER = {
  id: true,
  profession: true,
  headline: true,
  bio: true,
  specialties: true,
  languages: true,
  yearsExperience: true,
  country: true,
  city: true,
  serviceArea: true,
  timezone: true,
  ratingAvg: true,
  ratingCount: true,
  user: { select: { name: true } },
} as const;

router.get('/', async (req, res) => {
  const f = parse(searchSchema, req.query);
  // Virtual consultations are not tied to the patient's city.
  const remote = f.mode === 'VIRTUAL' || f.category === 'TELEHEALTH';

  const serviceWhere: Prisma.ServiceWhereInput = {
    active: true,
    ...(f.category && { category: f.category }),
    ...(f.mode && { mode: f.mode }),
    ...(f.currency && { currency: f.currency.toUpperCase() }),
    ...(f.maxPrice && { priceMinor: { lte: f.maxPrice } }),
  };

  const where: Prisma.ProviderProfileWhereInput = {
    ...bookableProviderWhere(),
    services: { some: serviceWhere },
    ...(f.profession && { profession: f.profession }),
    ...(f.country && { country: f.country.toUpperCase() }),
    ...(f.city && !remote && { city: { equals: f.city, mode: 'insensitive' } }),
    ...(f.language && { languages: { has: f.language } }),
    ...(f.weekday !== undefined && { availability: { some: { weekday: f.weekday } } }),
    ...(f.q && {
      OR: [
        { headline: { contains: f.q, mode: 'insensitive' } },
        { bio: { contains: f.q, mode: 'insensitive' } },
        { specialties: { has: f.q } },
        { user: { name: { contains: f.q, mode: 'insensitive' } } },
      ],
    }),
  };

  const providers = await prisma.providerProfile.findMany({
    where,
    select: { ...PUBLIC_PROVIDER, services: { where: serviceWhere, orderBy: { priceMinor: 'asc' } } },
    take: 50,
  });

  const results = providers.map((p) => ({ ...p, fromPriceMinor: p.services[0]?.priceMinor ?? null, currency: p.services[0]?.currency ?? null }));
  results.sort((a, b) =>
    f.sort === 'price'
      ? (a.fromPriceMinor ?? 0) - (b.fromPriceMinor ?? 0)
      : f.sort === 'experience'
        ? b.yearsExperience - a.yearsExperience
        : b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount,
  );
  res.json(results);
});

router.get('/:id', async (req, res) => {
  const provider = await prisma.providerProfile.findFirst({
    where: { id: req.params.id, ...bookableProviderWhere() },
    select: {
      ...PUBLIC_PROVIDER,
      services: { where: { active: true }, orderBy: { priceMinor: 'asc' } },
      availability: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] },
      // Only show that a credential was verified, never the document itself.
      credentials: { where: { status: 'APPROVED' }, select: { type: true, issuingBody: true, country: true, expiresAt: true } },
    },
  });
  if (!provider) throw notFound('Professional not found');
  const reviews = await prisma.review.findMany({
    where: { booking: { providerId: provider.id } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { rating: true, comment: true, createdAt: true, booking: { select: { service: { select: { title: true } } } } },
  });
  // Busy intervals for the next 8 weeks so the client can avoid offering taken slots.
  const busy = await prisma.booking.findMany({
    where: {
      providerId: provider.id,
      status: { in: ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS'] },
      startAt: { gte: new Date(), lte: new Date(Date.now() + 56 * 24 * 3600_000) },
    },
    select: { startAt: true, endAt: true },
  });
  res.json({ ...provider, reviews, busy });
});

export default router;
