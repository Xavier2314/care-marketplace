import type { BookingStatus, Category, Mode, Profession } from './types';

export function money(minor: number, currency: string) {
  const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency });
  const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
  return fmt.format(minor / 10 ** digits);
}

/** Converts a major-unit amount typed by a user into minor units for the given currency. */
export function toMinor(major: number, currency: string) {
  const digits = new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return Math.round(major * 10 ** digits);
}

export function fromMinor(minor: number, currency: string) {
  const digits = new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return minor / 10 ** digits;
}

export const dateTime = (iso: string, timeZone?: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone });

export const time = (d: Date, timeZone?: string) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone });

export const professionLabel: Record<Profession, string> = {
  CAREGIVER: 'Caregiver',
  NURSE: 'Nurse',
  DOCTOR: 'Doctor',
  PHYSIOTHERAPIST: 'Physiotherapist',
};

export const categoryLabel: Record<Category, string> = {
  HOME_CARE: 'Home care',
  PHYSIOTHERAPY: 'Physiotherapy',
  TELEHEALTH: 'Online consultation',
};

export const modeLabel: Record<Mode, string> = { HOME: 'At home', CLINIC: 'At clinic', VIRTUAL: 'Video call' };

export const statusLabel: Record<BookingStatus, string> = {
  REQUESTED: 'Awaiting confirmation',
  ACCEPTED: 'Confirmed',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

export const statusTone: Record<BookingStatus, string> = {
  REQUESTED: 'bg-amber-100 text-amber-800',
  ACCEPTED: 'bg-brand-100 text-brand-800',
  DECLINED: 'bg-slate-200 text-slate-700',
  CANCELLED: 'bg-slate-200 text-slate-700',
  IN_PROGRESS: 'bg-sky-100 text-sky-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
};

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const minutesToHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const hhmmToMinutes = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

export const COUNTRIES: [string, string][] = [
  ['NG', 'Nigeria'], ['KE', 'Kenya'], ['GH', 'Ghana'], ['ZA', 'South Africa'], ['EG', 'Egypt'], ['RW', 'Rwanda'],
  ['GB', 'United Kingdom'], ['IE', 'Ireland'], ['US', 'United States'], ['CA', 'Canada'], ['AU', 'Australia'],
  ['IN', 'India'], ['AE', 'United Arab Emirates'], ['DE', 'Germany'], ['FR', 'France'], ['BR', 'Brazil'],
];
export const countryName = (code: string) => COUNTRIES.find(([c]) => c === code)?.[1] ?? code;

export const CURRENCIES = ['NGN', 'KES', 'GHS', 'ZAR', 'EGP', 'RWF', 'GBP', 'EUR', 'USD', 'CAD', 'AUD', 'INR', 'AED', 'BRL'];
