const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    weekday: WEEKDAYS[get('weekday')],
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    minute: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** The instant at which the wall clock in `timeZone` reads `date` (YYYY-MM-DD) + `minute`. */
export function zonedToUtc(date: string, minute: number, timeZone: string) {
  const [y, m, d] = date.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d, 0, minute);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, 0, p.minute);
    guess += target - asUtc;
  }
  return new Date(guess);
}

/** Today's date (YYYY-MM-DD) in the given zone, offset by `days`. */
export function zonedDate(timeZone: string, days = 0) {
  const p = localParts(new Date(Date.now() + days * 86400_000), timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

export const viewerTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
