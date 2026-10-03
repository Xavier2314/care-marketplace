import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import { config } from './lib/config';
import { HttpError } from './lib/errors';
import authRoutes from './routes/auth';
import providerRoutes from './routes/providers';
import providerMeRoutes from './routes/provider-me';
import bookingRoutes from './routes/bookings';
import complaintRoutes from './routes/complaints';
import notificationRoutes from './routes/notifications';
import adminRoutes from './routes/admin';

export function createApp({ rateLimits = true } = {}) {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '200kb' }));
  if (rateLimits) {
    const message = { error: 'Too many requests. Please wait a few minutes and try again.' };
    app.use('/api', rateLimit({ windowMs: 15 * 60_000, limit: 300, message }));
    // Stricter limit on credential endpoints to slow down password guessing.
    app.use(['/api/auth/login', '/api/auth/register'], rateLimit({ windowMs: 15 * 60_000, limit: 20, message }));
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/providers', providerRoutes);
  app.use('/api/provider/me', providerMeRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/complaints', complaintRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/admin', adminRoutes);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'Malformed JSON' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });
  return app;
}
