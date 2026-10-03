import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

type Db = Prisma.TransactionClient | typeof prisma;

export function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  meta: Prisma.InputJsonValue = {},
  db: Db = prisma,
) {
  return db.auditLog.create({ data: { actorId, action, entity, entityId, meta } });
}

export function notify(userId: string, title: string, body: string, link?: string, db: Db = prisma) {
  return db.notification.create({ data: { userId, title, body, link } });
}
