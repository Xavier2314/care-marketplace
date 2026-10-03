import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { config } from './config';

export interface TokenPayload {
  sub: string;
  role: Role;
}

export const signToken = (payload: TokenPayload) =>
  jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });

export const verifyToken = (token: string) => jwt.verify(token, config.jwtSecret) as TokenPayload;
