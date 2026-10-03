import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { parse } from '../lib/validate';
import { signToken } from '../lib/jwt';
import { conflict, unauthorized } from '../lib/errors';
import { audit } from '../lib/audit';
import { currentUser, requireAuth } from '../middleware/auth';

const router = Router();

const publicUser = { id: true, email: true, name: true, phone: true, role: true, country: true, createdAt: true } as const;

const registerSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().trim().min(2),
  phone: z.string().trim().optional(),
  country: z.string().length(2).transform((c) => c.toUpperCase()),
  role: z.enum(['PATIENT', 'PROVIDER']),
});

router.post('/register', async (req, res) => {
  const data = parse(registerSchema, req.body);
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw conflict('An account with this email already exists');
  const { password, ...rest } = data;
  const user = await prisma.user.create({
    data: { ...rest, passwordHash: await bcrypt.hash(password, 12) },
    select: publicUser,
  });
  await audit(user.id, 'user.registered', 'User', user.id, { role: user.role });
  res.status(201).json({ token: signToken({ sub: user.id, role: user.role }), user });
});

router.post('/login', async (req, res) => {
  const { email, password } = parse(z.object({ email: z.string(), password: z.string() }), req.body);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw unauthorized('Incorrect email or password');
  if (user.suspended) throw unauthorized('This account is suspended. Please contact support.');
  const { passwordHash: _, suspended: __, ...safe } = user;
  res.json({ token: signToken({ sub: user.id, role: user.role }), user: safe });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: currentUser(req).id },
    select: { ...publicUser, provider: { select: { id: true, verificationStatus: true } } },
  });
  res.json(user);
});

export default router;
