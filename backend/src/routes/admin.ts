import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { parse } from '../lib/validate';
import { audit, notify } from '../lib/audit';
import { conflict, notFound } from '../lib/errors';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { sendDueReminders, warnExpiringCredentials } from '../services/reminders';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/stats', async (_req, res) => {
  const [users, providers, pendingReview, bookingsByStatus, openComplaints, safetyOpen, pendingPayouts, gmv] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: true }),
    prisma.providerProfile.groupBy({ by: ['verificationStatus'], _count: true }),
    prisma.providerProfile.count({ where: { verificationStatus: 'PENDING' } }),
    prisma.booking.groupBy({ by: ['status'], _count: true }),
    prisma.complaint.count({ where: { status: { not: 'RESOLVED' } } }),
    prisma.complaint.count({ where: { status: { not: 'RESOLVED' }, category: 'SAFETY' } }),
    prisma.payout.count({ where: { status: 'PENDING' } }),
    prisma.booking.groupBy({ by: ['currency'], where: { status: 'COMPLETED' }, _sum: { priceMinor: true, platformFeeMinor: true } }),
  ]);
  const completed = bookingsByStatus.find((b) => b.status === 'COMPLETED')?._count ?? 0;
  const cancelled = bookingsByStatus.find((b) => b.status === 'CANCELLED')?._count ?? 0;
  const repeatPatients = await prisma.booking.groupBy({ by: ['patientId'], where: { status: 'COMPLETED' }, _count: true, having: { patientId: { _count: { gt: 1 } } } });
  res.json({
    users,
    providers,
    pendingReview,
    bookingsByStatus,
    openComplaints,
    safetyOpen,
    pendingPayouts,
    revenueByCurrency: gmv.map((g) => ({ currency: g.currency, grossMinor: g._sum.priceMinor ?? 0, feesMinor: g._sum.platformFeeMinor ?? 0 })),
    // Pilot metrics named in the product concept.
    pilot: { completedBookings: completed, cancelledBookings: cancelled, repeatPatients: repeatPatients.length },
  });
});

router.get('/providers', async (req, res) => {
  const status = z.enum(['DRAFT', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED']).optional().parse(req.query.status || undefined);
  res.json(
    await prisma.providerProfile.findMany({
      where: status ? { verificationStatus: status } : {},
      orderBy: { updatedAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, country: true, suspended: true } },
        credentials: { orderBy: { createdAt: 'desc' } },
        services: true,
      },
    }),
  );
});

router.post('/credentials/:id/review', async (req, res) => {
  const admin = currentUser(req);
  const { decision, note } = parse(z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().max(1000).optional() }), req.body);
  const credential = await prisma.credential.findUnique({ where: { id: req.params.id }, include: { provider: true } });
  if (!credential) throw notFound('Credential not found');
  const updated = await prisma.credential.update({
    where: { id: credential.id },
    data: { status: decision, reviewNote: note, reviewedById: admin.id },
  });
  await audit(admin.id, `credential.${decision.toLowerCase()}`, 'Credential', credential.id, { note });
  await notify(credential.provider.userId, `Credential ${decision.toLowerCase()}`, `${credential.type} (${credential.issuingBody})${note ? `: ${note}` : ''}`, '/provider');
  res.json(updated);
});

router.post('/providers/:id/decision', async (req, res) => {
  const admin = currentUser(req);
  const { decision, note } = parse(
    z.object({ decision: z.enum(['VERIFIED', 'REJECTED', 'SUSPENDED']), note: z.string().max(1000).optional() }),
    req.body,
  );
  const provider = await prisma.providerProfile.findUnique({ where: { id: req.params.id }, include: { credentials: true } });
  if (!provider) throw notFound('Provider not found');
  if (decision === 'VERIFIED') {
    const valid = provider.credentials.some((c) => c.status === 'APPROVED' && (!c.expiresAt || c.expiresAt > new Date()));
    if (!valid) throw conflict('Approve at least one valid credential before verifying this professional');
  }
  const updated = await prisma.providerProfile.update({ where: { id: provider.id }, data: { verificationStatus: decision, reviewNote: note } });
  if (decision === 'VERIFIED') await prisma.service.updateMany({ where: { providerId: provider.id }, data: { active: true } });
  await audit(admin.id, `provider.${decision.toLowerCase()}`, 'ProviderProfile', provider.id, { note });
  const message = {
    VERIFIED: 'Your profile is verified and now visible to patients.',
    REJECTED: `Your profile was not approved${note ? `: ${note}` : '.'} You can update it and resubmit.`,
    SUSPENDED: `Your profile has been suspended${note ? `: ${note}` : '.'} Contact support for details.`,
  }[decision];
  await notify(provider.userId, 'Verification update', message, '/provider');
  res.json(updated);
});

router.get('/credentials/expiring', async (req, res) => {
  const days = z.coerce.number().int().min(1).max(365).default(30).parse(req.query.days ?? undefined);
  res.json(
    await prisma.credential.findMany({
      where: { status: 'APPROVED', expiresAt: { lte: new Date(Date.now() + days * 24 * 3600_000) } },
      orderBy: { expiresAt: 'asc' },
      include: { provider: { select: { id: true, profession: true, user: { select: { name: true, email: true } } } } },
    }),
  );
});

router.get('/complaints', async (_req, res) => {
  res.json(
    await prisma.complaint.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        reporter: { select: { name: true, email: true, role: true } },
        booking: { select: { id: true, startAt: true, status: true, service: { select: { title: true } }, provider: { select: { id: true, user: { select: { name: true } } } } } },
      },
    }),
  );
});

router.put('/complaints/:id', async (req, res) => {
  const admin = currentUser(req);
  const data = parse(z.object({ status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED']), resolution: z.string().max(5000).optional() }), req.body);
  const complaint = await prisma.complaint.update({ where: { id: req.params.id }, data });
  await audit(admin.id, 'complaint.updated', 'Complaint', complaint.id, data);
  await notify(complaint.reporterId, 'Update on your report', `Status: ${data.status.toLowerCase()}${data.resolution ? ` — ${data.resolution}` : ''}`);
  res.json(complaint);
});

router.get('/payouts', async (req, res) => {
  const status = z.enum(['PENDING', 'PAID']).optional().parse(req.query.status || undefined);
  res.json(
    await prisma.payout.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'asc' },
      include: { provider: { select: { user: { select: { name: true, email: true } } } }, booking: { select: { startAt: true } } },
    }),
  );
});

router.post('/payouts/:id/paid', async (req, res) => {
  const admin = currentUser(req);
  const payout = await prisma.payout.findUnique({ where: { id: req.params.id }, include: { provider: true } });
  if (!payout) throw notFound('Payout not found');
  if (payout.status === 'PAID') throw conflict('Payout already marked as paid');
  const updated = await prisma.payout.update({ where: { id: payout.id }, data: { status: 'PAID', paidAt: new Date() } });
  await audit(admin.id, 'payout.paid', 'Payout', payout.id);
  await notify(payout.provider.userId, 'Payout sent', `A payout has been sent for one of your completed bookings.`, '/provider/earnings');
  res.json(updated);
});

router.get('/audit-logs', async (_req, res) => {
  res.json(await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { actor: { select: { name: true, role: true } } } }));
});

router.post('/jobs/run', async (_req, res) => {
  res.json({ reminders: await sendDueReminders(), expiryWarnings: await warnExpiringCredentials() });
});

export default router;
