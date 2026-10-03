import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ErrorBox, Notice, PageTitle } from '../components/ui';

type Complaint = { id: string; category: string; status: string; description: string; resolution: string | null; createdAt: string };

export function ReportForm({ bookingId, onDone }: { bookingId?: string; onDone?: () => void }) {
  const [category, setCategory] = useState('SUPPORT');
  const [description, setDescription] = useState('');
  const send = useMutation({
    mutationFn: () => api('/complaints', { body: { bookingId, category, description } }),
    onSuccess: () => {
      setDescription('');
      onDone?.();
    },
  });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
      <div>
        <label className="label" htmlFor="category">What is it about?</label>
        <select id="category" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="SUPPORT">A question or problem using the service</option>
          <option value="SAFETY">A safety or safeguarding concern</option>
          <option value="QUALITY">Quality of care</option>
          <option value="CONDUCT">Professional conduct</option>
          <option value="BILLING">Payment or refund</option>
          <option value="OTHER">Something else</option>
        </select>
      </div>
      {category === 'SAFETY' && (
        <Notice tone="warn">If anyone is in immediate danger, call your local emergency number first. Safety reports are sent to our team straight away.</Notice>
      )}
      <div>
        <label className="label" htmlFor="description">Tell us what happened</label>
        <textarea id="description" className="input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} required minLength={10} />
      </div>
      <ErrorBox error={send.error} />
      {send.isSuccess && <Notice tone="success">Thanks — we've received your report and will follow up.</Notice>}
      <button className="btn-primary" disabled={send.isPending}>Send report</button>
    </form>
  );
}

export default function Help() {
  const { data, refetch } = useQuery({ queryKey: ['complaints', 'mine'], queryFn: () => api<Complaint[]>('/complaints/mine') });
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle title="Help & support" subtitle="Report a problem, raise a concern, or ask for help." />
      <Notice tone="warn">
        <strong>Emergencies:</strong> Care Marketplace is not an emergency service. If someone has chest pain, difficulty breathing, severe bleeding,
        signs of stroke or is unresponsive, call your local emergency number immediately.
      </Notice>
      <div className="card"><ReportForm onDone={() => refetch()} /></div>
      {!!data?.length && (
        <div className="card">
          <h2 className="mb-3 font-semibold text-ink">Your reports</h2>
          <ul className="space-y-3 text-sm">
            {data.map((c) => (
              <li key={c.id} className="border-b border-slate-100 pb-2 last:border-0">
                <div className="flex justify-between"><span className="font-medium">{c.category.toLowerCase()}</span><span className="chip">{c.status.toLowerCase()}</span></div>
                <p className="text-slate-700">{c.description}</p>
                {c.resolution && <p className="mt-1 text-slate-600">Response: {c.resolution}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
