import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { categoryLabel, dateTime, modeLabel, money, professionLabel } from '../lib/format';
import { viewerTimeZone } from '../lib/timezone';
import type { Booking } from '../lib/types';
import { ErrorBox, Notice, Spinner, StatusBadge } from '../components/ui';
import { ReportForm } from './Help';

export default function BookingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const created = (location.state as { created?: number } | null)?.created;
  const qc = useQueryClient();
  const { data: b, isLoading, error } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api<Booking>(`/bookings/${id}`),
    refetchInterval: 20_000,
  });
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api(`/bookings/${id}/${path}`, { method: 'POST', body: body ?? {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking', id] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });

  if (isLoading) return <Spinner />;
  if (error || !b || !user) return <ErrorBox error={error ?? 'Not found'} />;

  const isProvider = b.provider.user.id === user.id;
  const isPatient = b.patient.id === user.id;
  const other = isProvider ? b.patient : b.provider.user;
  const viewerTz = viewerTimeZone();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {created && (
          <Notice tone="success">
            {created > 1 ? `${created} weekly visits requested.` : 'Booking requested.'} Your payment is on hold. {b.provider.user.name} will confirm shortly —
            you'll get a notification.
          </Notice>
        )}
        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link to={isPatient ? '/bookings' : '/bookings'} className="text-sm text-brand-800 hover:underline">← All bookings</Link>
              <h1 className="mt-1 text-2xl font-bold text-ink">{b.service.title}</h1>
              <p className="text-slate-600">{categoryLabel[b.service.category]} · {modeLabel[b.mode]}</p>
            </div>
            <StatusBadge status={b.status} />
          </div>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <Info label="When">
              {dateTime(b.startAt)} – {new Date(b.endAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              {viewerTz !== b.provider.timezone && <div className="text-xs text-slate-500">Their time: {dateTime(b.startAt, b.provider.timezone)}</div>}
            </Info>
            <Info label="Care for">{b.careRecipientName}</Info>
            <Info label={isProvider ? 'Booked by' : 'Professional'}>
              {isProvider ? b.patient.name : (
                <Link to={`/providers/${b.provider.id}`} className="text-brand-800 hover:underline">
                  {b.provider.user.name} ({professionLabel[b.provider.profession].toLowerCase()})
                </Link>
              )}
              {other.phone && <div className="text-slate-600">{other.phone}</div>}
            </Info>
            {b.address && <Info label="Address">{b.address}</Info>}
            {b.notes && <Info label="Care needs" wide>{b.notes}</Info>}
            {b.cancelReason && <Info label="Reason given" wide>{b.cancelReason}</Info>}
          </dl>
        </section>

        {b.mode === 'VIRTUAL' && b.videoRoomUrl && ['ACCEPTED', 'IN_PROGRESS'].includes(b.status) && (
          <section className="card flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-ink">Video consultation</h2>
              <p className="text-sm text-slate-600">Join a few minutes early from a quiet, private place.</p>
            </div>
            <a href={b.videoRoomUrl} target="_blank" rel="noreferrer" className="btn-primary">Join video call</a>
          </section>
        )}

        {(b.checklist.length > 0 && (isProvider || b.status === 'COMPLETED')) && <Checklist booking={b} editable={isProvider && ['ACCEPTED', 'IN_PROGRESS'].includes(b.status)} />}
        {b.visitNotes && (
          <section className="card">
            <h2 className="mb-2 font-semibold text-ink">Visit summary</h2>
            <p className="whitespace-pre-line text-sm text-slate-700">{b.visitNotes}</p>
          </section>
        )}

        <Messages booking={b} userId={user.id} />
      </div>

      <aside className="space-y-4">
        <section className="card space-y-3">
          <h2 className="font-semibold text-ink">{isProvider ? 'Next step' : 'Manage booking'}</h2>
          <ErrorBox error={action.error} />
          {isProvider && <ProviderActions booking={b} run={(path, body) => action.mutate({ path, body })} busy={action.isPending} />}
          {(isPatient || isProvider) && ['REQUESTED', 'ACCEPTED'].includes(b.status) && (
            <CancelButton booking={b} isProvider={isProvider} run={(reason) => action.mutate({ path: 'cancel', body: { reason } })} busy={action.isPending} />
          )}
          {isPatient && b.status === 'COMPLETED' && !b.review && <ReviewForm onSubmit={(rating, comment) => action.mutate({ path: 'review', body: { rating, comment } })} busy={action.isPending} />}
          {b.review && <p className="text-sm text-slate-700">Reviewed: {'★'.repeat(b.review.rating)} {b.review.comment}</p>}
          {['DECLINED', 'CANCELLED'].includes(b.status) && isPatient && <Link to="/" className="btn-secondary w-full">Find another professional</Link>}
        </section>

        <section className="card text-sm">
          <h2 className="mb-2 font-semibold text-ink">Payment</h2>
          <Row label="Price" value={money(b.priceMinor, b.currency)} />
          {isProvider && <Row label="Platform fee" value={`− ${money(b.platformFeeMinor, b.currency)}`} />}
          {b.payment && <Row label="Status" value={paymentLabel(b.payment.status)} />}
          {!!b.payment?.refundedMinor && <Row label="Refunded" value={money(b.payment.refundedMinor, b.currency)} />}
          {isProvider && b.payout && <Row label="Your payout" value={`${money(b.payout.amountMinor, b.currency)} (${b.payout.status.toLowerCase()})`} />}
        </section>

        <section className="card">
          <h2 className="mb-2 font-semibold text-ink">Report a problem</h2>
          {b.complaints.map((c) => (
            <p key={c.id} className="mb-2 text-sm text-slate-600">Your {c.category.toLowerCase()} report is {c.status.toLowerCase()}.{c.resolution && ` ${c.resolution}`}</p>
          ))}
          <ReportForm bookingId={b.id} onDone={() => qc.invalidateQueries({ queryKey: ['booking', id] })} />
        </section>
      </aside>
    </div>
  );
}

const paymentLabel = (s: string) =>
  ({ AUTHORIZED: 'Held — charged after the visit', CAPTURED: 'Paid', REFUNDED: 'Refunded', PARTIALLY_REFUNDED: 'Partially refunded', FAILED: 'Failed' })[s] ?? s;

function Info({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-slate-800">{children}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between border-b border-slate-100 py-1.5 last:border-0"><span className="text-slate-600">{label}</span><span className="font-medium">{value}</span></div>;
}

function ProviderActions({ booking: b, run, busy }: { booking: Booking; run: (path: string, body?: unknown) => void; busy: boolean }) {
  const [notes, setNotes] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  if (b.status === 'REQUESTED') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-600">Accept to confirm the booking. The patient's payment is already held.</p>
        <button className="btn-primary w-full" disabled={busy} onClick={() => run('accept')}>Accept booking</button>
        <input className="input" placeholder="Reason for declining (optional)" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
        <button className="btn-danger w-full" disabled={busy} onClick={() => run('decline', { reason: declineReason || undefined })}>Decline</button>
      </div>
    );
  }
  if (b.status === 'ACCEPTED') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-600">{b.mode === 'VIRTUAL' ? 'Start when you join the call.' : 'Confirm when you arrive. The family is notified.'}</p>
        <button className="btn-primary w-full" disabled={busy} onClick={() => run('start')}>{b.mode === 'VIRTUAL' ? "I've joined the call" : "I've arrived"}</button>
      </div>
    );
  }
  if (b.status === 'IN_PROGRESS') {
    return (
      <div className="space-y-2">
        <label className="label" htmlFor="visitNotes">Visit summary for the patient/family</label>
        <textarea id="visitNotes" className="input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was done, anything to watch for, next steps. Keep clinical records in your own system." />
        <button className="btn-primary w-full" disabled={busy} onClick={() => run('complete', { visitNotes: notes || undefined })}>Complete visit</button>
      </div>
    );
  }
  return <p className="text-sm text-slate-600">No action needed.</p>;
}

function CancelButton({ booking, isProvider, run, busy }: { booking: Booking; isProvider: boolean; run: (reason?: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const hours = (new Date(booking.startAt).getTime() - Date.now()) / 3600_000;
  const late = !isProvider && booking.status === 'ACCEPTED' && hours < 24;
  if (!open) return <button className="btn-secondary w-full" onClick={() => setOpen(true)}>Cancel booking</button>;
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <p className="text-sm text-slate-700">
        {isProvider ? 'The patient will be fully refunded. Frequent cancellations affect your standing.' : late ? 'This is within 24 hours of the visit, so 50% will be refunded.' : 'You will be fully refunded.'}
      </p>
      <input className="input" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn-danger flex-1" disabled={busy} onClick={() => run(reason || undefined)}>Confirm cancellation</button>
        <button className="btn-secondary" onClick={() => setOpen(false)}>Keep</button>
      </div>
    </div>
  );
}

function ReviewForm({ onSubmit, busy }: { onSubmit: (rating: number, comment: string) => void; busy: boolean }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); onSubmit(rating, comment); }}>
      <p className="text-sm font-medium">How was your visit?</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} stars`} onClick={() => setRating(n)} className={`text-2xl ${n <= rating ? 'text-amber-500' : 'text-slate-300'}`}>★</button>
        ))}
      </div>
      <textarea className="input" rows={3} placeholder="Share what went well or could improve" value={comment} onChange={(e) => setComment(e.target.value)} />
      <button className="btn-primary w-full" disabled={!rating || busy}>Submit review</button>
    </form>
  );
}

function Checklist({ booking, editable }: { booking: Booking; editable: boolean }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (checklist: Booking['checklist']) => api(`/bookings/${booking.id}/checklist`, { method: 'PUT', body: checklist }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['booking', booking.id] }),
  });
  const toggle = (i: number) => save.mutate(booking.checklist.map((item, j) => (j === i ? { ...item, done: !item.done } : item)));
  return (
    <section className="card">
      <h2 className="mb-3 font-semibold text-ink">Visit checklist</h2>
      <ul className="space-y-2">
        {booking.checklist.map((item, i) => (
          <li key={i}>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-brand-700" checked={item.done} disabled={!editable || save.isPending} onChange={() => toggle(i)} />
              <span className={item.done ? 'text-slate-500 line-through' : ''}>{item.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Messages({ booking, userId }: { booking: Booking; userId: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const send = useMutation({
    mutationFn: () => api(`/bookings/${booking.id}/messages`, { body: { body } }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['booking', booking.id] });
    },
  });
  return (
    <section className="card">
      <h2 className="mb-3 font-semibold text-ink">Messages</h2>
      <div className="mb-3 max-h-80 space-y-2 overflow-y-auto">
        {booking.messages.length === 0 && <p className="text-sm text-slate-500">No messages yet. Use this to share access instructions or ask questions.</p>}
        {booking.messages.map((m) => (
          <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.sender.id === userId ? 'ml-auto bg-brand-700 text-white' : 'bg-slate-100 text-slate-800'}`}>
            <p className="whitespace-pre-line">{m.body}</p>
            <p className="mt-1 text-[11px] opacity-70">{m.sender.name} · {new Date(m.createdAt).toLocaleString()}</p>
          </div>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (body.trim()) send.mutate(); }}>
        <input className="input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message…" aria-label="Message" />
        <button className="btn-primary" disabled={send.isPending || !body.trim()}>Send</button>
      </form>
      <ErrorBox error={send.error} />
    </section>
  );
}
