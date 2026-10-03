import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { categoryLabel, countryName, minutesToHHMM, modeLabel, money, professionLabel, time, WEEKDAYS } from '../lib/format';
import { viewerTimeZone, weekdayOf, zonedDate, zonedToUtc } from '../lib/timezone';
import type { Booking, ProviderDetail, Service } from '../lib/types';
import { ErrorBox, Spinner, Stars, VerifiedBadge } from '../components/ui';

export default function ProviderPage() {
  const { id } = useParams();
  const { data: p, isLoading, error } = useQuery({ queryKey: ['provider', id], queryFn: () => api<ProviderDetail>(`/providers/${id}`) });
  const [serviceId, setServiceId] = useState<string>();

  if (isLoading) return <Spinner />;
  if (error || !p) return <ErrorBox error={error ?? 'Not found'} />;
  const service = p.services.find((s) => s.id === serviceId);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-ink">{p.user.name}</h1>
              <p className="text-slate-600">
                {professionLabel[p.profession]} · {p.city}, {countryName(p.country)} · {p.yearsExperience} years' experience
              </p>
              <div className="mt-1"><Stars value={p.ratingAvg} count={p.ratingCount} /></div>
            </div>
            <VerifiedBadge />
          </div>
          <p className="mt-4 font-medium text-slate-800">{p.headline}</p>
          {p.bio && <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{p.bio}</p>}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {p.specialties.map((s) => <span key={s} className="chip">{s}</span>)}
            {p.languages.map((l) => <span key={l} className="chip bg-white ring-1 ring-slate-200">Speaks {l}</span>)}
          </div>
          {p.serviceArea && <p className="mt-3 text-sm text-slate-600">Covers: {p.serviceArea}</p>}
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold text-ink">Services</h2>
          <div className="space-y-3">
            {p.services.map((s) => (
              <label key={s.id} className={`flex cursor-pointer items-start justify-between gap-4 rounded-lg border p-4 ${serviceId === s.id ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
                <div className="flex gap-3">
                  <input type="radio" name="service" className="mt-1 accent-brand-700" checked={serviceId === s.id} onChange={() => setServiceId(s.id)} />
                  <div>
                    <div className="font-medium">{s.title}</div>
                    <div className="text-xs text-slate-600">{categoryLabel[s.category]} · {modeLabel[s.mode]} · {s.pricingType === 'HOURLY' ? `min. ${s.durationMinutes / 60} h` : `${s.durationMinutes} min`}</div>
                    {s.description && <p className="mt-1 text-sm text-slate-700">{s.description}</p>}
                  </div>
                </div>
                <div className="whitespace-nowrap text-right font-semibold">
                  {money(s.priceMinor, s.currency)}
                  {s.pricingType === 'HOURLY' && <span className="text-sm font-normal text-slate-600"> / hour</span>}
                </div>
              </label>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold text-ink">Verified credentials</h2>
          <ul className="space-y-2 text-sm">
            {p.credentials.map((c, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2">
                <span>✓ {c.type} — {c.issuingBody} ({c.country})</span>
                {c.expiresAt && <span className="text-slate-500">valid until {new Date(c.expiresAt).toLocaleDateString()}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">Checked by our team against the issuing body. Licence documents are never shared publicly.</p>
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold text-ink">Weekly availability <span className="text-sm font-normal text-slate-500">({p.timezone})</span></h2>
          <ul className="grid gap-x-10 gap-y-1 text-sm sm:grid-cols-2">
            {WEEKDAYS.map((day, i) => {
              const slots = p.availability.filter((a) => a.weekday === i);
              return (
                <li key={day} className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-600">{day}</span>
                  <span>{slots.length ? slots.map((s) => `${minutesToHHMM(s.startMinute)}–${minutesToHHMM(s.endMinute)}`).join(', ') : '—'}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold text-ink">Reviews</h2>
          {p.reviews.length === 0 ? (
            <p className="text-sm text-slate-500">No reviews yet. Reviews can only be left after a completed booking.</p>
          ) : (
            <ul className="space-y-4">
              {p.reviews.map((r, i) => (
                <li key={i} className="border-b border-slate-100 pb-3 last:border-0">
                  <Stars value={r.rating} />
                  <p className="text-sm text-slate-700">{r.comment || <em className="text-slate-400">No comment</em>}</p>
                  <p className="text-xs text-slate-500">{r.booking.service.title} · {new Date(r.createdAt).toLocaleDateString()}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <BookingForm provider={p} service={service} />
      </aside>
    </div>
  );
}

function BookingForm({ provider, service }: { provider: ProviderDetail; service?: Service }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const viewerTz = viewerTimeZone();
  const [date, setDate] = useState(() => zonedDate(provider.timezone, 1));
  const [startMinute, setStartMinute] = useState<number>();
  const [hours, setHours] = useState(2);
  const [address, setAddress] = useState('');
  const [recipient, setRecipient] = useState(user?.name ?? '');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(1);

  const minutes = service ? (service.pricingType === 'HOURLY' ? Math.max(hours * 60, service.durationMinutes) : service.durationMinutes) : 60;

  // Candidate start times every 30 minutes inside availability, minus already-booked intervals.
  const options = useMemo(() => {
    if (!service) return [];
    const slots = provider.availability.filter((a) => a.weekday === weekdayOf(date));
    const busy = provider.busy.map((b) => [new Date(b.startAt).getTime(), new Date(b.endAt).getTime()]);
    const earliest = Date.now() + 60 * 60_000;
    const out: { minute: number; at: Date }[] = [];
    for (const slot of slots) {
      for (let m = slot.startMinute; m + minutes <= slot.endMinute; m += 30) {
        const at = zonedToUtc(date, m, provider.timezone);
        const end = at.getTime() + minutes * 60_000;
        if (at.getTime() < earliest) continue;
        if (busy.some(([s, e]) => at.getTime() < e && end > s)) continue;
        out.push({ minute: m, at });
      }
    }
    return out;
  }, [service, provider, date, minutes]);

  const selected = options.find((o) => o.minute === startMinute);
  const price = service ? (service.pricingType === 'FIXED' ? service.priceMinor : Math.round((service.priceMinor * minutes) / 60)) : 0;

  const book = useMutation({
    mutationFn: () =>
      api<Booking[]>('/bookings', {
        body: {
          serviceId: service!.id,
          startAt: selected!.at.toISOString(),
          durationMinutes: minutes,
          address: service!.mode === 'VIRTUAL' ? undefined : address,
          careRecipientName: recipient,
          notes,
          telehealthConsent: service!.mode === 'VIRTUAL' ? consent : undefined,
          repeatWeeks,
        },
      }),
    onSuccess: (bookings) => navigate(`/bookings/${bookings[0].id}`, { state: { created: bookings.length } }),
  });

  if (!service) {
    return (
      <div className="card">
        <h2 className="font-semibold text-ink">Book {provider.user.name.split(' ')[0]}</h2>
        <p className="mt-2 text-sm text-slate-600">Choose a service to see available times.</p>
      </div>
    );
  }
  if (!user || user.role !== 'PATIENT') {
    return (
      <div className="card space-y-3">
        <h2 className="font-semibold text-ink">Book {service.title}</h2>
        <p className="text-sm text-slate-600">{user ? 'Only patient and family accounts can book care.' : 'Create a free account or sign in to book.'}</p>
        {!user && (
          <div className="flex gap-2">
            <Link to="/register" className="btn-primary">Create account</Link>
            <Link to="/login" className="btn-secondary">Sign in</Link>
          </div>
        )}
      </div>
    );
  }

  const tzDiffers = viewerTz !== provider.timezone;
  return (
    <form
      className="card space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        book.mutate();
      }}
    >
      <h2 className="font-semibold text-ink">Book: {service.title}</h2>
      <div>
        <label className="label" htmlFor="date">Date</label>
        <input id="date" type="date" className="input" min={zonedDate(provider.timezone)} max={zonedDate(provider.timezone, 56)} value={date} onChange={(e) => { setDate(e.target.value); setStartMinute(undefined); }} required />
      </div>
      {service.pricingType === 'HOURLY' && (
        <div>
          <label className="label" htmlFor="hours">Hours</label>
          <select id="hours" className="input" value={hours} onChange={(e) => { setHours(Number(e.target.value)); setStartMinute(undefined); }}>
            {[1, 2, 3, 4, 6, 8, 10, 12].filter((h) => h * 60 >= service.durationMinutes).map((h) => <option key={h} value={h}>{h} hours</option>)}
          </select>
        </div>
      )}
      <div>
        <span className="label">Start time {tzDiffers && <span className="font-normal text-slate-500">(their time · your time)</span>}</span>
        {options.length === 0 ? (
          <p className="text-sm text-slate-500">No free times on this day. Try another date.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {options.map((o) => (
              <button
                type="button"
                key={o.minute}
                onClick={() => setStartMinute(o.minute)}
                className={`rounded-lg border px-2 py-1.5 text-sm ${startMinute === o.minute ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 hover:border-brand-600'}`}
              >
                {minutesToHHMM(o.minute)}
                {tzDiffers && <span className="block text-[11px] opacity-75">{time(o.at, viewerTz)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="label" htmlFor="recipient">Who is the care for?</label>
        <input id="recipient" className="input" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Name of patient or family member" required minLength={2} />
      </div>
      {service.mode !== 'VIRTUAL' && (
        <div>
          <label className="label" htmlFor="address">{service.mode === 'HOME' ? 'Visit address' : 'Your address (for records)'}</label>
          <textarea id="address" className="input" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} required={service.mode === 'HOME'} />
          <p className="mt-1 text-xs text-slate-500">Only shared with the professional for this booking.</p>
        </div>
      )}
      <div>
        <label className="label" htmlFor="notes">Care needs (optional)</label>
        <textarea id="notes" className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Mobility, routines, access instructions… Share only what the professional needs." />
      </div>
      {service.category !== 'TELEHEALTH' && (
        <div>
          <label className="label" htmlFor="repeat">Repeat weekly</label>
          <select id="repeat" className="input" value={repeatWeeks} onChange={(e) => setRepeatWeeks(Number(e.target.value))}>
            <option value={1}>Just once</option>
            {[2, 4, 6, 8, 12].map((w) => <option key={w} value={w}>Every week for {w} weeks</option>)}
          </select>
        </div>
      )}
      {service.mode === 'VIRTUAL' && (
        <label className="flex gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5 accent-brand-700" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
          <span>I consent to a video consultation. I understand it is not suitable for emergencies and the professional may advise an in-person visit.</span>
        </label>
      )}
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <div className="flex justify-between"><span>Price{repeatWeeks > 1 && ' per visit'}</span><span className="font-semibold">{money(price, service.currency)}</span></div>
        {repeatWeeks > 1 && <div className="flex justify-between text-slate-600"><span>{repeatWeeks} visits</span><span>{money(price * repeatWeeks, service.currency)}</span></div>}
        <p className="mt-2 text-xs text-slate-500">
          Payment is held, not taken, until the visit is completed. Free cancellation until 24 hours before; 50% refund after that.
        </p>
      </div>
      <ErrorBox error={book.error} />
      <button className="btn-primary w-full" disabled={!selected || book.isPending}>
        {book.isPending ? 'Booking…' : 'Request booking'}
      </button>
    </form>
  );
}
