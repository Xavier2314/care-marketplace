import { prisma } from '../lib/prisma';
import { config } from '../lib/config';
import { notify } from '../lib/audit';

/** Sends one reminder to both parties for each confirmed booking starting within the lead window. */
export async function sendDueReminders(now = new Date()) {
  const due = await prisma.booking.findMany({
    where: {
      status: 'ACCEPTED',
      reminderSentAt: null,
      startAt: { gt: now, lte: new Date(now.getTime() + config.reminderLeadHours * 3600_000) },
    },
    include: { service: true, provider: true },
  });
  for (const b of due) {
    const when = b.startAt.toUTCString();
    await notify(b.patientId, 'Upcoming appointment', `"${b.service.title}" on ${when}`, `/bookings/${b.id}`);
    await notify(b.provider.userId, 'Upcoming visit', `"${b.service.title}" for ${b.careRecipientName} on ${when}`, `/bookings/${b.id}`);
    await prisma.booking.update({ where: { id: b.id }, data: { reminderSentAt: now } });
  }
  return due.length;
}

/** Warns providers whose credentials expire within the next 30 days (at most once a week per credential). */
export async function warnExpiringCredentials(now = new Date()) {
  const soon = new Date(now.getTime() + 30 * 24 * 3600_000);
  const creds = await prisma.credential.findMany({
    where: { status: 'APPROVED', expiresAt: { gt: now, lte: soon } },
    include: { provider: true },
  });
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000);
  let sent = 0;
  for (const c of creds) {
    const recent = await prisma.notification.count({
      where: { userId: c.provider.userId, link: `/provider/credentials#${c.id}`, createdAt: { gt: weekAgo } },
    });
    if (recent) continue;
    await notify(
      c.provider.userId,
      'Credential expiring soon',
      `Your ${c.type} (${c.issuingBody}) expires on ${c.expiresAt!.toDateString()}. Upload a renewal to stay bookable.`,
      `/provider/credentials#${c.id}`,
    );
    sent++;
  }
  return sent;
}
