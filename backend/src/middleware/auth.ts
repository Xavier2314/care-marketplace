import { NextFunction, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { verifyToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { forbidden, unauthorized } from '../lib/errors';

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  let payload;
  try {
    payload = verifyToken(header.slice(7));
  } catch {
    throw unauthorized('Invalid or expired session');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw unauthorized();
  if (user.suspended) throw forbidden('This account is suspended. Please contact support.');
  req.user = { id: user.id, role: user.role, name: user.name, email: user.email };
  next();
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden();
    next();
  };

export const currentUser = (req: Request): AuthUser => {
  if (!req.user) throw unauthorized();
  return req.user;
};
