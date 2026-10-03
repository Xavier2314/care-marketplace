import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { parse } from '../lib/validate';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import {
  acceptBooking,
  cancelBooking,
  completeBooking,
  createBookings,
  declineBooking,
  getBookingFor,
  postMessage,
  reviewBooking,
  startBooking,
  updateChecklist,
} from '../services/bookings';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  serviceId: z.uuid(),
  startAt: z.coerce.date(),
  durationMinutes: z.number().int().min(15).max(24 * 60).optional(),
  address: z.string().trim().max(500).optional(),
  careRecipientName: z.string().trim().min(2).max(120),
  notes: z.string().max(2000).optional(),
  telehealthConsent: z.boolean().optional(),
  repeatWeeks: z.number().int().min(1).max(12).optional(),
});

router.post('/', requireRole('PATIENT'), async (req, res) => {
  const bookings = await createBookings(currentUser(req), parse(createSchema, req.body));
  res.status(201).json(bookings);
});

/** Bookings for the current user: as patient, or as provider. */
router.get('/', async (req, res) => {
  const user = currentUser(req);
  const scope = z.enum(['upcoming', 'past', 'all']).default('all').parse(req.query.scope ?? undefined);
  const where =
    user.role === 'PROVIDER' ? { provider: { userId: user.id } } : user.role === 'PATIENT' ? { patientId: user.id } : {};
  const now = new Date();
  const time =
    scope === 'upcoming'
      ? { endAt: { gte: now }, status: { in: ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS'] as const } }
      : scope === 'past'
        ? { OR: [{ endAt: { lt: now } }, { status: { in: ['COMPLETED', 'CANCELLED', 'DECLINED'] as const } }] }
        : {};
  const bookings = await prisma.booking.findMany({
    where: { ...where, ...time } as never,
    orderBy: { startAt: scope === 'past' ? 'desc' : 'asc' },
    take: 200,
    include: {
      service: { select: { title: true, category: true } },
      patient: { select: { name: true } },
      provider: { select: { id: true, profession: true, user: { select: { name: true } } } },
    },
  });
  res.json(bookings);
});

router.get('/:id', async (req, res) => {
  res.json(await getBookingFor(req.params.id, currentUser(req)));
});

const reason = z.object({ reason: z.string().max(500).optional() });

router.post('/:id/accept', async (req, res) => res.json(await acceptBooking(req.params.id, currentUser(req))));
router.post('/:id/decline', async (req, res) =>
  res.json(await declineBooking(req.params.id, currentUser(req), parse(reason, req.body ?? {}).reason)),
);
router.post('/:id/cancel', async (req, res) =>
  res.json(await cancelBooking(req.params.id, currentUser(req), parse(reason, req.body ?? {}).reason)),
);
router.post('/:id/start', async (req, res) => res.json(await startBooking(req.params.id, currentUser(req))));

router.put('/:id/checklist', async (req, res) => {
  const items = parse(z.array(z.object({ label: z.string().min(1).max(200), done: z.boolean() })).max(30), req.body);
  res.json(await updateChecklist(req.params.id, currentUser(req), items));
});

router.post('/:id/complete', async (req, res) => {
  const { visitNotes } = parse(z.object({ visitNotes: z.string().max(5000).optional() }), req.body ?? {});
  res.json(await completeBooking(req.params.id, currentUser(req), visitNotes));
});

router.post('/:id/review', async (req, res) => {
  const { rating, comment } = parse(z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(2000).optional() }), req.body);
  res.status(201).json(await reviewBooking(req.params.id, currentUser(req), rating, comment));
});

router.post('/:id/messages', async (req, res) => {
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
  res.status(201).json(await postMessage(req.params.id, currentUser(req), body));
});

export default router;
