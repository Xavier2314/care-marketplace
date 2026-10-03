import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Notification } from '../lib/types';
import { Empty, PageTitle, Spinner } from '../components/ui';

export default function Notifications() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['notifications'], queryFn: () => api<Notification[]>('/notifications') });
  const hasUnread = data?.some((n) => !n.readAt);

  useEffect(() => {
    if (hasUnread) {
      // Mark as read after the list has been shown, but keep the highlight for this visit.
      const t = setTimeout(() => api('/notifications/read-all', { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })), 1500);
      return () => clearTimeout(t);
    }
  }, [hasUnread, qc]);

  if (isLoading) return <Spinner />;
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Notifications" />
      {!data?.length ? (
        <Empty>Nothing yet. Booking updates, reminders and messages will appear here.</Empty>
      ) : (
        <ul className="space-y-2">
          {data.map((n) => {
            const body = (
              <>
                <div className="flex justify-between gap-3">
                  <span className="font-medium text-ink">{n.title}</span>
                  <span className="whitespace-nowrap text-xs text-slate-500">{new Date(n.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-sm text-slate-700">{n.body}</p>
              </>
            );
            const cls = `block rounded-lg border p-3 ${n.readAt ? 'border-slate-200 bg-white' : 'border-brand-200 bg-brand-50'}`;
            return <li key={n.id}>{n.link ? <Link to={n.link} className={`${cls} hover:border-brand-500`}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
