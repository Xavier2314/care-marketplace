import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { categoryLabel, dateTime, modeLabel, money, professionLabel } from '../lib/format';
import type { Booking } from '../lib/types';
import { Empty, ErrorBox, PageTitle, Spinner, StatusBadge, Tabs } from '../components/ui';

type Row = Pick<Booking, 'id' | 'startAt' | 'mode' | 'status' | 'priceMinor' | 'currency' | 'careRecipientName' | 'recurrenceGroupId'> & {
  service: { title: string; category: Booking['service']['category'] };
  patient: { name: string };
  provider: { id: string; profession: Booking['provider']['profession']; user: { name: string } };
};

export default function Bookings() {
  const { user } = useAuth();
  const isProvider = user?.role === 'PROVIDER';
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const { data, isLoading, error } = useQuery({ queryKey: ['bookings', scope], queryFn: () => api<Row[]>(`/bookings?scope=${scope}`) });
  const requests = isProvider ? data?.filter((b) => b.status === 'REQUESTED') ?? [] : [];

  return (
    <div>
      <PageTitle
        title={isProvider ? 'Your bookings' : 'My bookings'}
        subtitle={isProvider ? 'Accept new requests, prepare for visits, and complete them to get paid.' : 'Your appointments, past visits and receipts.'}
        action={!isProvider && <Link to="/" className="btn-primary">Book care</Link>}
      />
      {isProvider && user?.provider?.verificationStatus !== 'VERIFIED' && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Your profile isn't live yet. <Link to="/provider" className="font-semibold underline">Finish your profile and submit it for verification</Link>.
        </div>
      )}
      {scope === 'upcoming' && requests.length > 0 && (
        <div className="mb-4 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800">
          You have {requests.length} new request{requests.length > 1 ? 's' : ''} waiting for your response.
        </div>
      )}
      <Tabs tabs={[['upcoming', 'Upcoming'], ['past', 'Past & cancelled']]} value={scope} onChange={setScope} />
      <ErrorBox error={error} />
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty>{scope === 'upcoming' ? 'No upcoming bookings.' : 'No past bookings yet.'}</Empty>
      ) : (
        <ul className="space-y-3">
          {data.map((b) => (
            <li key={b.id}>
              <Link to={`/bookings/${b.id}`} className="card flex flex-wrap items-center justify-between gap-3 hover:border-brand-500">
                <div>
                  <div className="font-semibold text-ink">{b.service.title}</div>
                  <div className="text-sm text-slate-600">
                    {dateTime(b.startAt)} · {modeLabel[b.mode]} · {categoryLabel[b.service.category]}
                  </div>
                  <div className="text-sm text-slate-600">
                    {isProvider ? `For ${b.careRecipientName} (booked by ${b.patient.name})` : `With ${b.provider.user.name}, ${professionLabel[b.provider.profession].toLowerCase()}`}
                    {b.recurrenceGroupId && <span className="chip ml-2">Recurring</span>}
                  </div>
                </div>
                <div className="text-right">
                  <StatusBadge status={b.status} />
                  <div className="mt-1 text-sm font-medium">{money(b.priceMinor, b.currency)}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
