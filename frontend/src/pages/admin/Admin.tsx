import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { categoryLabel, countryName, modeLabel, money, professionLabel, statusLabel } from '../../lib/format';
import type { BookingStatus, Credential, Profession, Service, VerificationStatus } from '../../lib/types';
import { Empty, ErrorBox, Notice, PageTitle, Spinner, Tabs } from '../../components/ui';

type Tab = 'overview' | 'verification' | 'complaints' | 'payouts' | 'expiring' | 'audit';

export default function Admin() {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <div>
      <PageTitle title="Operations" subtitle="Verification, safety, payouts and pilot metrics." />
      <Tabs
        tabs={[['overview', 'Overview'], ['verification', 'Verification queue'], ['complaints', 'Complaints'], ['payouts', 'Payouts'], ['expiring', 'Expiring licences'], ['audit', 'Audit log']]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'overview' && <Overview />}
      {tab === 'verification' && <Verification />}
      {tab === 'complaints' && <Complaints />}
      {tab === 'payouts' && <Payouts />}
      {tab === 'expiring' && <Expiring />}
      {tab === 'audit' && <Audit />}
    </div>
  );
}

interface Stats {
  users: { role: string; _count: number }[];
  providers: { verificationStatus: VerificationStatus; _count: number }[];
  pendingReview: number;
  bookingsByStatus: { status: BookingStatus; _count: number }[];
  openComplaints: number;
  safetyOpen: number;
  pendingPayouts: number;
  revenueByCurrency: { currency: string; grossMinor: number; feesMinor: number }[];
  pilot: { completedBookings: number; cancelledBookings: number; repeatPatients: number };
}

function Overview() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api<Stats>('/admin/stats') });
  const jobs = useMutation({ mutationFn: () => api<{ reminders: number; expiryWarnings: number }>('/admin/jobs/run', { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }) });
  if (isLoading || !data) return <Spinner />;
  const totalBookings = data.bookingsByStatus.reduce((n, b) => n + b._count, 0);
  const verified = data.providers.find((p) => p.verificationStatus === 'VERIFIED')?._count ?? 0;
  const tiles: [string, string | number, string?][] = [
    ['Completed bookings', data.pilot.completedBookings, `${totalBookings} total`],
    ['Active verified providers', verified, `${data.pendingReview} awaiting review`],
    ['Repeat patients', data.pilot.repeatPatients, 'more than one completed visit'],
    ['Cancellation rate', totalBookings ? `${Math.round((data.pilot.cancelledBookings / totalBookings) * 100)}%` : '—'],
    ['Open complaints', data.openComplaints, `${data.safetyOpen} safety`],
    ['Payouts to send', data.pendingPayouts],
  ];
  return (
    <div className="space-y-6">
      {data.safetyOpen > 0 && <Notice tone="warn">{data.safetyOpen} open safety report{data.safetyOpen > 1 ? 's' : ''} — review these first.</Notice>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(([label, value, hint]) => (
          <div key={label} className="card">
            <div className="text-sm text-slate-600">{label}</div>
            <div className="mt-1 text-3xl font-bold text-ink">{value}</div>
            {hint && <div className="text-xs text-slate-500">{hint}</div>}
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 font-semibold text-ink">Bookings by status</h2>
          {data.bookingsByStatus.length === 0 ? <p className="text-sm text-slate-500">No bookings yet.</p> : (
            <ul className="text-sm">{data.bookingsByStatus.map((b) => <li key={b.status} className="flex justify-between border-b border-slate-100 py-1"><span>{statusLabel[b.status]}</span><span className="font-medium">{b._count}</span></li>)}</ul>
          )}
        </div>
        <div className="card">
          <h2 className="mb-2 font-semibold text-ink">Completed volume</h2>
          {data.revenueByCurrency.length === 0 ? <p className="text-sm text-slate-500">No completed bookings yet.</p> : (
            <ul className="text-sm">{data.revenueByCurrency.map((r) => <li key={r.currency} className="flex justify-between border-b border-slate-100 py-1"><span>{money(r.grossMinor, r.currency)} gross</span><span className="font-medium">{money(r.feesMinor, r.currency)} fees</span></li>)}</ul>
          )}
        </div>
      </div>
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Reminders and licence-expiry warnings run every 5 minutes. Run them now:</p>
        <button className="btn-secondary" onClick={() => jobs.mutate()} disabled={jobs.isPending}>Run jobs</button>
        {jobs.data && <p className="w-full text-sm text-slate-600">Sent {jobs.data.reminders} reminders and {jobs.data.expiryWarnings} expiry warnings.</p>}
      </div>
    </div>
  );
}

interface AdminProvider {
  id: string;
  profession: Profession;
  headline: string;
  bio: string;
  city: string;
  country: string;
  yearsExperience: number;
  verificationStatus: VerificationStatus;
  updatedAt: string;
  user: { name: string; email: string; phone: string | null; suspended: boolean };
  credentials: Credential[];
  services: Service[];
}

function Verification() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<VerificationStatus>('PENDING');
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'providers', status], queryFn: () => api<AdminProvider[]>(`/admin/providers?status=${status}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });
  const reviewCred = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: string; note?: string }) => api(`/admin/credentials/${id}/review`, { body: { decision, note } }),
    onSuccess: refresh,
  });
  const decide = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: string; note?: string }) => api(`/admin/providers/${id}/decision`, { body: { decision, note } }),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'DRAFT'] as VerificationStatus[]).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`chip ${status === s ? 'bg-brand-700 text-white' : ''}`}>{s.toLowerCase()}</button>
        ))}
      </div>
      <ErrorBox error={reviewCred.error ?? decide.error} />
      {isLoading ? <Spinner /> : !data?.length ? <Empty>Nothing here.</Empty> : data.map((p) => (
        <article key={p.id} className="card space-y-3">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <h3 className="font-semibold text-ink">{p.user.name} <span className="font-normal text-slate-500">· {professionLabel[p.profession]}</span></h3>
              <p className="text-sm text-slate-600">{p.user.email}{p.user.phone && ` · ${p.user.phone}`} · {p.city}, {countryName(p.country)} · {p.yearsExperience} yrs</p>
              <p className="text-sm text-slate-700">{p.headline}</p>
            </div>
            <span className="chip self-start">{p.verificationStatus.toLowerCase()}</span>
          </div>
          <div>
            <h4 className="mb-1 text-sm font-semibold">Credentials</h4>
            <p className="mb-2 text-xs text-slate-500">Check each one directly with the issuing body's public register before approving.</p>
            <ul className="space-y-2">
              {p.credentials.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-sm">
                  <div>
                    <div className="font-medium">{c.type} — {c.issuingBody} ({c.country})</div>
                    <div className="text-slate-600">
                      No. {c.number}{c.expiresAt && ` · expires ${new Date(c.expiresAt).toLocaleDateString()}`}
                      {c.documentUrl && <> · <a href={c.documentUrl} target="_blank" rel="noreferrer" className="text-brand-800 underline">document</a></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="chip">{c.status.toLowerCase()}</span>
                    {c.status !== 'APPROVED' && <button className="btn-secondary px-2 py-1 text-xs" onClick={() => reviewCred.mutate({ id: c.id, decision: 'APPROVED' })}>Approve</button>}
                    {c.status !== 'REJECTED' && (
                      <button className="btn-danger px-2 py-1 text-xs" onClick={() => { const note = prompt('Reason for rejecting this credential?'); if (note !== null) reviewCred.mutate({ id: c.id, decision: 'REJECTED', note }); }}>Reject</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-1 text-sm font-semibold">Services</h4>
            <ul className="text-sm text-slate-700">
              {p.services.map((s) => <li key={s.id}>{s.title} — {categoryLabel[s.category]}, {modeLabel[s.mode]}, {money(s.priceMinor, s.currency)}{s.pricingType === 'HOURLY' && '/h'}</li>)}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {p.verificationStatus !== 'VERIFIED' && <button className="btn-primary" onClick={() => decide.mutate({ id: p.id, decision: 'VERIFIED' })}>Verify professional</button>}
            {p.verificationStatus === 'PENDING' && (
              <button className="btn-danger" onClick={() => { const note = prompt('What does the professional need to fix?'); if (note) decide.mutate({ id: p.id, decision: 'REJECTED', note }); }}>Reject</button>
            )}
            {p.verificationStatus === 'VERIFIED' && (
              <button className="btn-danger" onClick={() => { const note = prompt('Reason for suspension (shared with the professional)?'); if (note) decide.mutate({ id: p.id, decision: 'SUSPENDED', note }); }}>Suspend</button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

interface AdminComplaint {
  id: string;
  category: string;
  description: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED';
  resolution: string | null;
  createdAt: string;
  reporter: { name: string; email: string; role: string };
  booking: { id: string; startAt: string; status: string; service: { title: string }; provider: { id: string; user: { name: string } } } | null;
}

function Complaints() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'complaints'], queryFn: () => api<AdminComplaint[]>('/admin/complaints') });
  const update = useMutation({
    mutationFn: ({ id, status, resolution }: { id: string; status: string; resolution?: string }) => api(`/admin/complaints/${id}`, { method: 'PUT', body: { status, resolution } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
  if (isLoading) return <Spinner />;
  if (!data?.length) return <Empty>No complaints. 🎉</Empty>;
  return (
    <div className="space-y-3">
      <ErrorBox error={update.error} />
      {data.map((c) => (
        <article key={c.id} className={`card ${c.category === 'SAFETY' && c.status !== 'RESOLVED' ? 'border-red-300' : ''}`}>
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`chip ${c.category === 'SAFETY' ? 'bg-red-100 text-red-800' : ''}`}>{c.category.toLowerCase()}</span>
              <span className="chip">{c.status.toLowerCase()}</span>
            </div>
            <span className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleString()}</span>
          </div>
          <p className="mt-2 text-sm text-slate-800">{c.description}</p>
          <p className="mt-1 text-xs text-slate-500">
            From {c.reporter.name} ({c.reporter.role.toLowerCase()}, {c.reporter.email})
            {c.booking && <> · re <Link className="text-brand-800 underline" to={`/bookings/${c.booking.id}`}>{c.booking.service.title}</Link> with {c.booking.provider.user.name}</>}
          </p>
          {c.resolution && <p className="mt-2 text-sm text-slate-700">Resolution: {c.resolution}</p>}
          {c.status !== 'RESOLVED' && (
            <div className="mt-3 flex gap-2">
              {c.status === 'OPEN' && <button className="btn-secondary" onClick={() => update.mutate({ id: c.id, status: 'INVESTIGATING' })}>Start investigating</button>}
              <button className="btn-primary" onClick={() => { const resolution = prompt('Resolution (shared with the reporter)'); if (resolution) update.mutate({ id: c.id, status: 'RESOLVED', resolution }); }}>Resolve</button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

interface AdminPayout {
  id: string;
  amountMinor: number;
  currency: string;
  status: 'PENDING' | 'PAID';
  createdAt: string;
  provider: { user: { name: string; email: string } };
  booking: { startAt: string };
}

function Payouts() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'payouts'], queryFn: () => api<AdminPayout[]>('/admin/payouts?status=PENDING') });
  const pay = useMutation({ mutationFn: (id: string) => api(`/admin/payouts/${id}/paid`, { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }) });
  if (isLoading) return <Spinner />;
  if (!data?.length) return <Empty>No payouts waiting.</Empty>;
  return (
    <div className="card overflow-x-auto p-0">
      <ErrorBox error={pay.error} />
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Professional</th><th className="p-3">Visit date</th><th className="p-3">Amount</th><th className="p-3" /></tr></thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.id} className="border-t border-slate-100">
              <td className="p-3">{p.provider.user.name}<div className="text-xs text-slate-500">{p.provider.user.email}</div></td>
              <td className="p-3">{new Date(p.booking.startAt).toLocaleDateString()}</td>
              <td className="p-3 font-medium">{money(p.amountMinor, p.currency)}</td>
              <td className="p-3 text-right"><button className="btn-secondary px-2 py-1 text-xs" disabled={pay.isPending} onClick={() => pay.mutate(p.id)}>Mark as paid</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Expiring() {
  type Row = Credential & { provider: { id: string; profession: Profession; user: { name: string; email: string } } };
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'expiring'], queryFn: () => api<Row[]>('/admin/credentials/expiring?days=60') });
  if (isLoading) return <Spinner />;
  if (!data?.length) return <Empty>No approved credentials expire in the next 60 days.</Empty>;
  return (
    <ul className="space-y-2">
      {data.map((c) => {
        const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
        return (
          <li key={c.id} className="card flex flex-wrap justify-between gap-2 text-sm">
            <div>
              <div className="font-medium">{c.provider.user.name} · {professionLabel[c.provider.profession]}</div>
              <div className="text-slate-600">{c.type} — {c.issuingBody}</div>
            </div>
            <span className={`chip ${expired ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
              {expired ? 'Expired' : 'Expires'} {new Date(c.expiresAt!).toLocaleDateString()}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Audit() {
  type Log = { id: string; action: string; entity: string; entityId: string; createdAt: string; meta: unknown; actor: { name: string; role: string } | null };
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => api<Log[]>('/admin/audit-logs') });
  if (isLoading) return <Spinner />;
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">When</th><th className="p-3">Who</th><th className="p-3">Action</th><th className="p-3">Record</th></tr></thead>
        <tbody>
          {data?.map((l) => (
            <tr key={l.id} className="border-t border-slate-100">
              <td className="whitespace-nowrap p-3 text-slate-600">{new Date(l.createdAt).toLocaleString()}</td>
              <td className="p-3">{l.actor ? `${l.actor.name} (${l.actor.role.toLowerCase()})` : 'system'}</td>
              <td className="p-3 font-mono text-xs">{l.action}</td>
              <td className="p-3 font-mono text-xs text-slate-500">{l.entity}:{l.entityId.slice(0, 8)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
