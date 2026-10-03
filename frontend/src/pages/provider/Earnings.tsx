import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { Empty, PageTitle, Spinner } from '../../components/ui';

interface Payout {
  id: string;
  bookingId: string;
  amountMinor: number;
  currency: string;
  status: 'PENDING' | 'PAID';
  paidAt: string | null;
  createdAt: string;
  booking: { startAt: string; careRecipientName: string; service: { title: string } };
}

export default function Earnings() {
  const { data, isLoading } = useQuery({ queryKey: ['payouts'], queryFn: () => api<Payout[]>('/provider/me/payouts') });
  if (isLoading) return <Spinner />;

  const totals = new Map<string, { pending: number; paid: number }>();
  for (const p of data ?? []) {
    const t = totals.get(p.currency) ?? { pending: 0, paid: 0 };
    t[p.status === 'PAID' ? 'paid' : 'pending'] += p.amountMinor;
    totals.set(p.currency, t);
  }

  return (
    <div>
      <PageTitle title="Earnings" subtitle="Payouts are created when you complete a visit (or for late cancellations), after the platform commission." />
      {totals.size > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[...totals].map(([currency, t]) => (
            <div key={currency} className="card">
              <div className="text-xs font-medium uppercase text-slate-500">{currency}</div>
              <div className="mt-1 text-2xl font-bold text-ink">{money(t.pending, currency)}</div>
              <div className="text-sm text-slate-600">pending · {money(t.paid, currency)} paid</div>
            </div>
          ))}
        </div>
      )}
      {!data?.length ? (
        <Empty>No earnings yet. Completed visits will appear here.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="p-3">Visit</th><th className="p-3">Date</th><th className="p-3">Amount</th><th className="p-3">Status</th></tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="p-3"><Link to={`/bookings/${p.bookingId}`} className="text-brand-800 hover:underline">{p.booking.service.title}</Link><div className="text-xs text-slate-500">{p.booking.careRecipientName}</div></td>
                  <td className="p-3">{new Date(p.booking.startAt).toLocaleDateString()}</td>
                  <td className="p-3 font-medium">{money(p.amountMinor, p.currency)}</td>
                  <td className="p-3"><span className={`chip ${p.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{p.status === 'PAID' ? `Paid ${new Date(p.paidAt!).toLocaleDateString()}` : 'Pending'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
