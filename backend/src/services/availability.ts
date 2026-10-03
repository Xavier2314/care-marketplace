import { AvailabilitySlot } from '@prisma/client';

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Weekday (0 = Sunday) and minutes-from-midnight of an instant in the given IANA time zone. */
export function localParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    weekday: WEEKDAYS[get('weekday')],
    minute: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/**
 * True when [start, end) falls entirely inside one weekly availability slot in
 * the provider's time zone. Bookings crossing local midnight are not supported.
 */
export function fitsAvailability(slots: AvailabilitySlot[], start: Date, end: Date, timeZone: string) {
  const s = localParts(start, timeZone);
  const e = localParts(new Date(end.getTime() - 1), timeZone);
  if (s.weekday !== e.weekday) return false;
  return slots.some((slot) => slot.weekday === s.weekday && slot.startMinute <= s.minute && e.minute < slot.endMinute);
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
