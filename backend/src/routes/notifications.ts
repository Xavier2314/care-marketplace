import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { currentUser, requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  res.json(await prisma.notification.findMany({ where: { userId: currentUser(req).id }, orderBy: { createdAt: 'desc' }, take: 50 }));
});

router.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: currentUser(req).id, readAt: null }, data: { readAt: new Date() } });
  res.status(204).end();
});

export default router;
