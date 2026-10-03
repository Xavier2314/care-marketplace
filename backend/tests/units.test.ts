import { describe, expect, it } from 'vitest';
import { AvailabilitySlot } from '@prisma/client';
import { fitsAvailability, localParts } from '../src/services/availability';
import { bookingPrice, platformFee } from '../src/services/money';
import { cancellationRefund } from '../src/services/bookings';
import { isServiceAllowed } from '../src/lib/scope';

const slot = (weekday: number, start: number, end: number) =>
  ({ id: 'x', providerId: 'p', weekday, startMinute: start * 60, endMinute: end * 60 }) as AvailabilitySlot;

describe('availability', () => {
  it('converts to the provider time zone', () => {
    // Monday 2026-10-05 08:00 UTC is 09:00 in Lagos and 04:00 in New York.
    const instant = new Date('2026-10-05T08:00:00Z');
    expect(localParts(instant, 'Africa/Lagos')).toEqual({ weekday: 1, minute: 9 * 60 });
    expect(localParts(instant, 'America/New_York')).toEqual({ weekday: 1, minute: 4 * 60 });
  });

  it('accepts bookings inside a slot and rejects ones spilling over', () => {
    const slots = [slot(1, 9, 17)];
    const at = (iso: string) => new Date(iso);
    expect(fitsAvailability(slots, at('2026-10-05T08:00:00Z'), at('2026-10-05T16:00:00Z'), 'Africa/Lagos')).toBe(true);
    expect(fitsAvailability(slots, at('2026-10-05T15:30:00Z'), at('2026-10-05T16:30:00Z'), 'Africa/Lagos')).toBe(false);
    expect(fitsAvailability(slots, at('2026-10-06T08:00:00Z'), at('2026-10-06T09:00:00Z'), 'Africa/Lagos')).toBe(false);
  });
});

describe('money', () => {
  it('prices hourly services by duration', () => {
    expect(bookingPrice('HOURLY', 6000, 150)).toBe(15000);
    expect(bookingPrice('FIXED', 6000, 150)).toBe(6000);
    expect(platformFee(10000, 15)).toBe(1500);
  });
});

describe('cancellation policy', () => {
  const now = new Date('2026-10-05T00:00:00Z');
  const booking = (hoursAhead: number, status: 'REQUESTED' | 'ACCEPTED' = 'ACCEPTED') => ({
    status,
    priceMinor: 10000,
    startAt: new Date(now.getTime() + hoursAhead * 3600_000),
  });

  it('refunds in full when cancelled early, by the provider, or before acceptance', () => {
    expect(cancellationRefund(booking(48), false, now)).toBe(10000);
    expect(cancellationRefund(booking(2), true, now)).toBe(10000);
    expect(cancellationRefund(booking(2, 'REQUESTED'), false, now)).toBe(10000);
  });

  it('refunds half for late patient cancellations', () => {
    expect(cancellationRefund(booking(2), false, now)).toBe(5000);
  });
});

describe('professional scope', () => {
  it('limits services to the profession', () => {
    expect(isServiceAllowed('CAREGIVER', 'HOME_CARE', 'HOME')).toBe(true);
    expect(isServiceAllowed('CAREGIVER', 'TELEHEALTH', 'VIRTUAL')).toBe(false);
    expect(isServiceAllowed('DOCTOR', 'TELEHEALTH', 'HOME')).toBe(false);
    expect(isServiceAllowed('PHYSIOTHERAPIST', 'PHYSIOTHERAPY', 'VIRTUAL')).toBe(true);
  });
});
