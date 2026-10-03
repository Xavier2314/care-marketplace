import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { categoryLabel, COUNTRIES, countryName, modeLabel, money, professionLabel } from '../lib/format';
import type { Category, ProviderSummary } from '../lib/types';
import { Empty, ErrorBox, Spinner, Stars, VerifiedBadge } from '../components/ui';
import { useAuth } from '../lib/auth';

const CATEGORIES: [Category | '', string, string][] = [
  ['', 'All care', 'Every verified professional'],
  ['HOME_CARE', 'Home care', 'Caregivers and nurses who visit'],
  ['PHYSIOTHERAPY', 'Physiotherapy', 'Recovery, mobility, rehab'],
  ['TELEHEALTH', 'Online consultation', 'Video calls with doctors and nurses'],
];

export default function Home() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [compare, setCompare] = useState<string[]>([]);
  const category = (params.get('category') ?? '') as Category | '';
  const filters = {
    category,
    country: params.get('country') ?? user?.country ?? '',
    city: params.get('city') ?? '',
    language: params.get('language') ?? '',
    q: params.get('q') ?? '',
    sort: params.get('sort') ?? 'rating',
  };

  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const { data, isLoading, error } = useQuery({
    queryKey: ['providers', query],
    queryFn: () => api<ProviderSummary[]>(`/providers?${query}`),
  });

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const toggleCompare = (id: string) =>
    setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < 3 ? [...c, id] : c));
  const compared = data?.filter((p) => compare.includes(p.id)) ?? [];

  return (
    <div>
      <section className="mb-8 rounded-2xl bg-ink px-6 py-10 text-white sm:px-10">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-500">Trusted care, verified professionals</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-bold sm:text-4xl">Find and book a trusted healthcare professional.</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Caregivers, nurses, doctors and physiotherapists — at home, in clinic, or by video. Every professional's identity and licence is checked
          before they appear here.
        </p>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {CATEGORIES.map(([value, label, hint]) => (
          <button
            key={label}
            onClick={() => update('category', value)}
            className={`rounded-xl border p-4 text-left transition ${category === value ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}
          >
            <div className="font-semibold text-ink">{label}</div>
            <div className="mt-1 text-xs text-slate-600">{hint}</div>
          </button>
        ))}
      </div>

      <div className="card mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="label" htmlFor="country">Country</label>
          <select id="country" className="input" value={filters.country} onChange={(e) => update('country', e.target.value)}>
            <option value="">Anywhere</option>
            {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="city">City</label>
          <input id="city" className="input" placeholder={category === 'TELEHEALTH' ? 'Not needed for video' : 'e.g. Lagos'} value={filters.city} onChange={(e) => update('city', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="language">Language</label>
          <input id="language" className="input" placeholder="e.g. Swahili" value={filters.language} onChange={(e) => update('language', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="q">Need</label>
          <input id="q" className="input" placeholder="e.g. dementia, stroke" value={filters.q} onChange={(e) => update('q', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="sort">Sort by</label>
          <select id="sort" className="input" value={filters.sort} onChange={(e) => update('sort', e.target.value)}>
            <option value="rating">Highest rated</option>
            <option value="price">Lowest price</option>
            <option value="experience">Most experienced</option>
          </select>
        </div>
      </div>

      <ErrorBox error={error} />
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty>No verified professionals match these filters yet. Try another city, or switch to online consultations.</Empty>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">
            {data.length} verified professional{data.length === 1 ? '' : 's'} · tick up to three to compare
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {data.map((p) => (
              <ProviderCard key={p.id} p={p} compared={compare.includes(p.id)} onCompare={() => toggleCompare(p.id)} />
            ))}
          </div>
        </>
      )}

      {compared.length >= 2 && (
        <>
          {/* Leaves room to scroll results clear of the fixed compare drawer. */}
          <div className="h-[60vh]" aria-hidden />
          <CompareTable providers={compared} onClose={() => setCompare([])} />
        </>
      )}
    </div>
  );
}

function ProviderCard({ p, compared, onCompare }: { p: ProviderSummary; compared: boolean; onCompare: () => void }) {
  return (
    <article className="card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-800" aria-hidden>
            {p.user.name.replace('Dr. ', '').charAt(0)}
          </div>
          <div>
            <h2 className="font-semibold text-ink">
              <Link to={`/providers/${p.id}`} className="hover:underline">{p.user.name}</Link>
            </h2>
            <p className="text-sm text-slate-600">
              {professionLabel[p.profession]} · {p.city}, {countryName(p.country)} · {p.yearsExperience} yrs
            </p>
          </div>
        </div>
        <VerifiedBadge />
      </div>
      <p className="text-sm text-slate-700">{p.headline}</p>
      <div className="flex flex-wrap gap-1.5">
        {p.services.slice(0, 3).map((s) => (
          <span key={s.id} className="chip">{categoryLabel[s.category]} · {modeLabel[s.mode]}</span>
        ))}
        {p.languages.map((l) => <span key={l} className="chip bg-white ring-1 ring-slate-200">{l}</span>)}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <div>
          <Stars value={p.ratingAvg} count={p.ratingCount} />
          {p.fromPriceMinor !== null && p.currency && (
            <div className="text-sm text-slate-700">
              From <span className="font-semibold">{money(p.fromPriceMinor, p.currency)}</span>
              {p.services[0]?.pricingType === 'HOURLY' && ' / hour'}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={compared} onChange={onCompare} className="accent-brand-700" /> Compare
          </label>
          <Link to={`/providers/${p.id}`} className="btn-primary">View & book</Link>
        </div>
      </div>
    </article>
  );
}

function CompareTable({ providers, onClose }: { providers: ProviderSummary[]; onClose: () => void }) {
  const rows: [string, (p: ProviderSummary) => string][] = [
    ['Profession', (p) => professionLabel[p.profession]],
    ['Location', (p) => `${p.city}, ${countryName(p.country)}`],
    ['Experience', (p) => `${p.yearsExperience} years`],
    ['Rating', (p) => (p.ratingCount ? `${p.ratingAvg.toFixed(1)} (${p.ratingCount} reviews)` : 'No reviews yet')],
    ['Languages', (p) => p.languages.join(', ')],
    ['Services', (p) => p.services.map((s) => `${s.title} — ${money(s.priceMinor, s.currency)}${s.pricingType === 'HOURLY' ? '/h' : ''}`).join('\n')],
    ['Specialties', (p) => p.specialties.join(', ') || '—'],
  ];
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 max-h-[60vh] overflow-auto border-t border-slate-200 bg-white shadow-2xl">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-ink">Compare professionals</h2>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr>
                <th className="w-32 p-2" />
                {providers.map((p) => (
                  <th key={p.id} className="p-2">
                    <Link className="text-brand-800 hover:underline" to={`/providers/${p.id}`}>{p.user.name}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, get]) => (
                <tr key={label} className="border-t border-slate-100 align-top">
                  <th className="p-2 font-medium text-slate-600">{label}</th>
                  {providers.map((p) => <td key={p.id} className="whitespace-pre-line p-2">{get(p)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
