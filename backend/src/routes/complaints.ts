import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { parse } from '../lib/validate';
import { audit, notify } from '../lib/audit';
import { forbidden, notFound } from '../lib/errors';
import { currentUser, requireAuth } from '../middleware/auth';
import { isParticipant } from '../services/bookings';

/** Complaints, incident reports and support requests, from patients or providers. */
const router = Router();
router.use(requireAuth);

const schema = z.object({
  bookingId: z.uuid().optional(),
  category: z.enum(['SAFETY', 'QUALITY', 'CONDUCT', 'BILLING', 'SUPPORT', 'OTHER']),
  description: z.string().trim().min(10).max(5000),
});

router.post('/', async (req, res) => {
  const user = currentUser(req);
  const data = parse(schema, req.body);
  if (data.bookingId) {
    const booking = await prisma.booking.findUnique({ where: { id: data.bookingId }, include: { provider: { select: { userId: true } } } });
    if (!booking) throw notFound('Booking not found');
    if (!isParticipant(booking, user)) throw forbidden();
  }
  const complaint = await prisma.complaint.create({ data: { ...data, reporterId: user.id } });
  await audit(user.id, 'complaint.created', 'Complaint', complaint.id, { category: data.category });
  // Safety reports go straight to every admin.
  if (data.category === 'SAFETY') {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    await Promise.all(admins.map((a) => notify(a.id, 'Safety report received', data.description.slice(0, 140), '/admin/complaints')));
  }
  res.status(201).json(complaint);
});

router.get('/mine', async (req, res) => {
  res.json(await prisma.complaint.findMany({ where: { reporterId: currentUser(req).id }, orderBy: { createdAt: 'desc' } }));
});

export default router;
