import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  categoryLabel, COUNTRIES, CURRENCIES, fromMinor, hhmmToMinutes, minutesToHHMM, modeLabel, money, professionLabel, toMinor, WEEKDAYS,
} from '../../lib/format';
import { viewerTimeZone } from '../../lib/timezone';
import type { Category, Credential, Mode, Profession, Service, Slot, VerificationStatus } from '../../lib/types';
import { ErrorBox, Notice, PageTitle, Spinner, Tabs } from '../../components/ui';

interface MyProfile {
  id: string;
  profession: Profession;
  headline: string;
  bio: string;
  specialties: string[];
  languages: string[];
  yearsExperience: number;
  country: string;
  city: string;
  serviceArea: string;
  timezone: string;
  verificationStatus: VerificationStatus;
  reviewNote: string | null;
  credentials: Credential[];
  services: Service[];
  availability: Slot[];
}

// Mirrors the server's professional-scope rules so the form only offers valid choices.
const SCOPE: Record<Profession, Category[]> = {
  CAREGIVER: ['HOME_CARE'],
  NURSE: ['HOME_CARE', 'TELEHEALTH'],
  DOCTOR: ['TELEHEALTH', 'HOME_CARE'],
  PHYSIOTHERAPIST: ['PHYSIOTHERAPY'],
};
const MODES: Record<Category, Mode[]> = { HOME_CARE: ['HOME'], PHYSIOTHERAPY: ['HOME', 'CLINIC', 'VIRTUAL'], TELEHEALTH: ['VIRTUAL'] };

const STATUS_COPY: Record<VerificationStatus, [string, 'info' | 'warn' | 'success']> = {
  DRAFT: ['Complete each section, then submit your profile for verification.', 'info'],
  PENDING: ['Submitted — our team is checking your credentials. This usually takes 1–3 working days.', 'info'],
  VERIFIED: ['Verified — your profile is live and patients can book you.', 'success'],
  REJECTED: ['Not approved yet. See the note below, update your profile, and resubmit.', 'warn'],
  SUSPENDED: ['Your profile is suspended. Please contact support.', 'warn'],
};

export default function ProviderProfile() {
  const { refresh } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'profile' | 'credentials' | 'services' | 'availability'>('profile');
  const { data, isLoading } = useQuery({ queryKey: ['my-provider'], queryFn: () => api<MyProfile | null>('/provider/me') });
  const reload = () => {
    qc.invalidateQueries({ queryKey: ['my-provider'] });
    refresh();
  };
  const submit = useMutation({ mutationFn: () => api('/provider/me/submit', { method: 'POST' }), onSuccess: reload });

  if (isLoading) return <Spinner />;
  const status = data?.verificationStatus ?? 'DRAFT';
  const steps = [
    ['Profile', !!data],
    ['Credentials', !!data?.credentials.length],
    ['Services', !!data?.services.length],
    ['Availability', !!data?.availability.length],
  ] as const;

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title="My professional profile"
        action={
          ['DRAFT', 'REJECTED'].includes(status) && (
            <button className="btn-primary" disabled={!steps.every(([, done]) => done) || submit.isPending} onClick={() => submit.mutate()}>
              Submit for verification
            </button>
          )
        }
      />
      <div className="mb-4 space-y-2">
        <Notice tone={STATUS_COPY[status][1]}>{STATUS_COPY[status][0]}</Notice>
        {data?.reviewNote && <Notice tone="warn">Reviewer note: {data.reviewNote}</Notice>}
        <ErrorBox error={submit.error} />
        <ol className="flex flex-wrap gap-2 text-xs">
          {steps.map(([label, done], i) => (
            <li key={label} className={`chip ${done ? 'bg-emerald-100 text-emerald-800' : ''}`}>{done ? '✓' : i + 1}. {label}</li>
          ))}
        </ol>
      </div>
      <Tabs
        tabs={[['profile', 'Profile'], ['credentials', 'Credentials'], ['services', 'Services & prices'], ['availability', 'Availability']]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'profile' && <ProfileForm profile={data ?? null} onSaved={reload} />}
      {tab !== 'profile' && !data && <Notice>Save your profile first.</Notice>}
      {tab === 'credentials' && data && <Credentials profile={data} onChange={reload} />}
      {tab === 'services' && data && <Services profile={data} onChange={reload} />}
      {tab === 'availability' && data && <Availability key={JSON.stringify(data.availability)} profile={data} onChange={reload} />}
    </div>
  );
}

const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

function ProfileForm({ profile, onSaved }: { profile: MyProfile | null; onSaved: () => void }) {
  const { user } = useAuth();
  const [f, setF] = useState({
    profession: profile?.profession ?? 'CAREGIVER',
    headline: profile?.headline ?? '',
    bio: profile?.bio ?? '',
    specialties: profile?.specialties.join(', ') ?? '',
    languages: profile?.languages.join(', ') ?? 'English',
    yearsExperience: profile?.yearsExperience ?? 0,
    country: profile?.country ?? user?.country ?? 'NG',
    city: profile?.city ?? '',
    serviceArea: profile?.serviceArea ?? '',
    timezone: profile?.timezone ?? viewerTimeZone(),
  });
  const save = useMutation({
    mutationFn: () => api('/provider/me', { method: 'PUT', body: { ...f, specialties: csv(f.specialties), languages: csv(f.languages) } }),
    onSuccess: onSaved,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: k === 'yearsExperience' ? Number(e.target.value) : e.target.value });
  const zones = Intl.supportedValuesOf?.('timeZone') ?? [f.timezone];

  return (
    <form className="card grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div>
        <label className="label" htmlFor="profession">Profession</label>
        <select id="profession" className="input" value={f.profession} onChange={set('profession')}>
          {(Object.keys(professionLabel) as Profession[]).map((p) => <option key={p} value={p}>{professionLabel[p]}</option>)}
        </select>
        {profile?.verificationStatus === 'VERIFIED' && f.profession !== profile.profession && (
          <p className="mt-1 text-xs text-amber-700">Changing profession sends your profile back for verification and pauses your services.</p>
        )}
      </div>
      <div>
        <label className="label" htmlFor="years">Years of experience</label>
        <input id="years" type="number" min={0} max={70} className="input" value={f.yearsExperience} onChange={set('yearsExperience')} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="headline">Headline</label>
        <input id="headline" className="input" value={f.headline} onChange={set('headline')} placeholder="e.g. Registered nurse — elderly and post-surgery home care" required minLength={5} maxLength={120} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="bio">About you</label>
        <textarea id="bio" className="input" rows={4} value={f.bio} onChange={set('bio')} />
      </div>
      <div>
        <label className="label" htmlFor="specialties">Specialties (comma-separated)</label>
        <input id="specialties" className="input" value={f.specialties} onChange={set('specialties')} />
      </div>
      <div>
        <label className="label" htmlFor="languages">Languages (comma-separated)</label>
        <input id="languages" className="input" value={f.languages} onChange={set('languages')} required />
      </div>
      <div>
        <label className="label" htmlFor="pcountry">Country</label>
        <select id="pcountry" className="input" value={f.country} onChange={set('country')}>
          {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="city">City</label>
        <input id="city" className="input" value={f.city} onChange={set('city')} required />
      </div>
      <div>
        <label className="label" htmlFor="area">Areas you cover</label>
        <input id="area" className="input" value={f.serviceArea} onChange={set('serviceArea')} placeholder="e.g. Ikeja, Yaba, Surulere" />
      </div>
      <div>
        <label className="label" htmlFor="tz">Time zone</label>
        <select id="tz" className="input" value={f.timezone} onChange={set('timezone')}>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <ErrorBox error={save.error} />
        {save.isSuccess && <Notice tone="success">Saved.</Notice>}
        <button className="btn-primary mt-2" disabled={save.isPending}>Save profile</button>
      </div>
    </form>
  );
}

function Credentials({ profile, onChange }: { profile: MyProfile; onChange: () => void }) {
  const [f, setF] = useState({ type: 'Professional licence', issuingBody: '', number: '', country: profile.country, expiresAt: '', documentUrl: '' });
  const add = useMutation({
    mutationFn: () =>
      api('/provider/me/credentials', {
        body: { ...f, expiresAt: f.expiresAt || undefined, documentUrl: f.documentUrl || undefined },
      }),
    onSuccess: () => {
      setF({ ...f, issuingBody: '', number: '', expiresAt: '', documentUrl: '' });
      onChange();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/provider/me/credentials/${id}`, { method: 'DELETE' }), onSuccess: onChange });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="mb-3 font-semibold text-ink">Your credentials</h2>
        {profile.credentials.length === 0 ? (
          <p className="text-sm text-slate-500">Add your professional licence or registration. Caregivers can add a training certificate and government ID.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {profile.credentials.map((c) => (
              <li key={c.id} id={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <div className="font-medium">{c.type} — {c.issuingBody}</div>
                  <div className="text-slate-600">
                    No. {c.number} · {c.country}{c.expiresAt && ` · expires ${new Date(c.expiresAt).toLocaleDateString()}`}
                  </div>
                  {c.reviewNote && <div className="text-amber-700">Note: {c.reviewNote}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`chip ${c.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : c.status === 'REJECTED' ? 'bg-red-100 text-red-800' : ''}`}>
                    {c.status.toLowerCase()}
                  </span>
                  {c.status !== 'APPROVED' && <button className="text-xs text-red-700 hover:underline" onClick={() => remove.mutate(c.id)}>Remove</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form className="card grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <h2 className="font-semibold text-ink sm:col-span-2">Add a credential</h2>
        <div>
          <label className="label" htmlFor="ctype">Type</label>
          <select id="ctype" className="input" value={f.type} onChange={set('type')}>
            {['Professional licence', 'Professional registration', 'Training certificate', 'Government ID', 'Background check'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="body">Issuing body</label>
          <input id="body" className="input" value={f.issuingBody} onChange={set('issuingBody')} placeholder="e.g. Nursing and Midwifery Council" required />
        </div>
        <div>
          <label className="label" htmlFor="number">Number</label>
          <input id="number" className="input" value={f.number} onChange={set('number')} required />
        </div>
        <div>
          <label className="label" htmlFor="ccountry">Issuing country</label>
          <select id="ccountry" className="input" value={f.country} onChange={set('country')}>
            {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="expires">Expiry date</label>
          <input id="expires" type="date" className="input" value={f.expiresAt} onChange={set('expiresAt')} />
        </div>
        <div>
          <label className="label" htmlFor="doc">Document link (optional)</label>
          <input id="doc" type="url" className="input" value={f.documentUrl} onChange={set('documentUrl')} placeholder="Secure link to a scan" />
        </div>
        <div className="sm:col-span-2">
          <ErrorBox error={add.error ?? remove.error} />
          <button className="btn-primary mt-2" disabled={add.isPending}>Add credential</button>
        </div>
      </form>
    </div>
  );
}

function Services({ profile, onChange }: { profile: MyProfile; onChange: () => void }) {
  const categories = SCOPE[profile.profession];
  const blank = {
    category: categories[0], title: '', description: '', mode: MODES[categories[0]][0], pricingType: 'FIXED' as 'FIXED' | 'HOURLY',
    price: '', currency: profile.services[0]?.currency ?? 'USD', durationMinutes: 60, active: true,
  };
  const [editing, setEditing] = useState<string | null>(null);
  const [f, setF] = useState(blank);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, price: undefined, priceMinor: toMinor(Number(f.price), f.currency) };
      return editing ? api(`/provider/me/services/${editing}`, { method: 'PUT', body }) : api('/provider/me/services', { body });
    },
    onSuccess: () => {
      setEditing(null);
      setF(blank);
      onChange();
    },
  });
  const edit = (s: Service) => {
    setEditing(s.id);
    setF({ ...s, price: String(fromMinor(s.priceMinor, s.currency)) });
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = ['durationMinutes'].includes(k) ? Number(e.target.value) : e.target.value;
    const next = { ...f, [k]: value };
    if (k === 'category') next.mode = MODES[value as Category][0];
    setF(next);
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="mb-3 font-semibold text-ink">Your services</h2>
        {profile.services.length === 0 ? (
          <p className="text-sm text-slate-500">Add at least one service with a clear price.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {profile.services.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <div className="font-medium">{s.title} {!s.active && <span className="chip">paused</span>}</div>
                  <div className="text-slate-600">{categoryLabel[s.category]} · {modeLabel[s.mode]} · {s.durationMinutes} min{s.pricingType === 'HOURLY' && ' minimum'}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{money(s.priceMinor, s.currency)}{s.pricingType === 'HOURLY' && '/h'}</span>
                  <button className="text-xs text-brand-800 hover:underline" onClick={() => edit(s)}>Edit</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form className="card grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <h2 className="font-semibold text-ink sm:col-span-2">{editing ? 'Edit service' : 'Add a service'}</h2>
        <div>
          <label className="label" htmlFor="cat">Category</label>
          <select id="cat" className="input" value={f.category} onChange={set('category')}>
            {categories.map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">Only categories within a {professionLabel[profile.profession].toLowerCase()}'s scope are shown.</p>
        </div>
        <div>
          <label className="label" htmlFor="mode">Where</label>
          <select id="mode" className="input" value={f.mode} onChange={set('mode')}>
            {MODES[f.category].map((m) => <option key={m} value={m}>{modeLabel[m]}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="title">Title</label>
          <input id="title" className="input" value={f.title} onChange={set('title')} placeholder="e.g. Overnight care shift" required minLength={3} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="desc">What's included</label>
          <textarea id="desc" className="input" rows={2} value={f.description} onChange={set('description')} />
        </div>
        <div>
          <label className="label" htmlFor="ptype">Pricing</label>
          <select id="ptype" className="input" value={f.pricingType} onChange={set('pricingType')}>
            <option value="FIXED">Fixed price per visit</option>
            <option value="HOURLY">Hourly rate</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="duration">{f.pricingType === 'HOURLY' ? 'Minimum length (minutes)' : 'Length (minutes)'}</label>
          <input id="duration" type="number" min={15} step={15} className="input" value={f.durationMinutes} onChange={set('durationMinutes')} required />
        </div>
        <div>
          <label className="label" htmlFor="price">{f.pricingType === 'HOURLY' ? 'Rate per hour' : 'Price'}</label>
          <input id="price" type="number" min={0} step="0.01" className="input" value={f.price} onChange={set('price')} required />
        </div>
        <div>
          <label className="label" htmlFor="currency">Currency</label>
          <select id="currency" className="input" value={f.currency} onChange={set('currency')}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        {editing && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="accent-brand-700" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Available for booking
          </label>
        )}
        <div className="sm:col-span-2">
          <p className="mb-2 text-xs text-slate-500">The platform keeps a commission on each completed booking; the rest is paid out to you.</p>
          <ErrorBox error={save.error} />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={save.isPending}>{editing ? 'Save changes' : 'Add service'}</button>
            {editing && <button type="button" className="btn-secondary" onClick={() => { setEditing(null); setF(blank); }}>Cancel</button>}
          </div>
        </div>
      </form>
    </div>
  );
}

function Availability({ profile, onChange }: { profile: MyProfile; onChange: () => void }) {
  const [slots, setSlots] = useState<Slot[]>(profile.availability);
  const save = useMutation({ mutationFn: () => api('/provider/me/availability', { method: 'PUT', body: slots }), onSuccess: onChange });
  const update = (i: number, patch: Partial<Slot>) => setSlots(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="card space-y-4">
      <p className="text-sm text-slate-600">Weekly hours in your time zone ({profile.timezone}). Patients can only book inside these hours.</p>
      {WEEKDAYS.map((day, weekday) => (
        <div key={day} className="flex flex-wrap items-start gap-3 border-b border-slate-100 pb-3">
          <div className="w-28 pt-2 text-sm font-medium">{day}</div>
          <div className="flex-1 space-y-2">
            {slots.map((s, i) => s.weekday === weekday && (
              <div key={i} className="flex items-center gap-2">
                <input type="time" className="input w-32" value={minutesToHHMM(s.startMinute)} onChange={(e) => update(i, { startMinute: hhmmToMinutes(e.target.value) })} aria-label={`${day} start`} />
                <span>–</span>
                <input type="time" className="input w-32" value={minutesToHHMM(s.endMinute % 1440)} onChange={(e) => update(i, { endMinute: hhmmToMinutes(e.target.value) || 1440 })} aria-label={`${day} end`} />
                <button className="text-sm text-red-700 hover:underline" onClick={() => setSlots(slots.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            <button className="text-sm text-brand-800 hover:underline" onClick={() => setSlots([...slots, { weekday, startMinute: 9 * 60, endMinute: 17 * 60 }])}>+ Add hours</button>
          </div>
        </div>
      ))}
      <ErrorBox error={save.error} />
      {save.isSuccess && <Notice tone="success">Availability saved.</Notice>}
      <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save availability</button>
    </div>
  );
}
