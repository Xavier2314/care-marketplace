import type { ReactNode } from 'react';
import type { BookingStatus } from '../lib/types';
import { statusLabel, statusTone } from '../lib/format';

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <span className={`chip ${statusTone[status]}`}>{statusLabel[status]}</span>;
}

export function Stars({ value, count }: { value: number; count?: number }) {
  if (count === 0) return <span className="text-sm text-slate-500">New — no reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-slate-700" aria-label={`${value.toFixed(1)} out of 5`}>
      <span className="text-amber-500">{'★'.repeat(Math.round(value))}{'☆'.repeat(5 - Math.round(value))}</span>
      <span className="font-medium">{value.toFixed(1)}</span>
      {count !== undefined && <span className="text-slate-500">({count})</span>}
    </span>
  );
}

export function VerifiedBadge() {
  return (
    <span className="chip shrink-0 whitespace-nowrap bg-brand-100 text-brand-800" title="Identity and professional credentials checked by our team">
      ✓ Verified
    </span>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'success'; children: ReactNode }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return <div className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Spinner() {
  return <div className="py-10 text-center text-sm text-slate-500">Loading…</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">{children}</div>;
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${value === key ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
