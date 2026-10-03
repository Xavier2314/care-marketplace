import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Notification } from '../lib/types';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-100'}`;

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<Notification[]>('/notifications'),
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const unread = notifications?.filter((n) => !n.readAt).length ?? 0;

  const links = !user
    ? [['/', 'Find care']]
    : user.role === 'PATIENT'
      ? [['/', 'Find care'], ['/bookings', 'My bookings'], ['/help', 'Help']]
      : user.role === 'PROVIDER'
        ? [['/bookings', 'Bookings'], ['/provider', 'My profile'], ['/provider/earnings', 'Earnings'], ['/help', 'Help']]
        : [['/admin', 'Admin'], ['/', 'Marketplace']];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to={user?.role === 'PROVIDER' ? '/bookings' : user?.role === 'ADMIN' ? '/admin' : '/'} className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <span className="text-lg font-bold text-ink">Care Marketplace</span>
          </Link>
          <button className="btn-secondary sm:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu">
            ☰
          </button>
          <nav className={`${open ? 'flex' : 'hidden'} absolute left-0 right-0 top-full flex-col gap-1 border-b border-slate-200 bg-white p-3 sm:static sm:flex sm:flex-row sm:items-center sm:border-0 sm:p-0`} onClick={() => setOpen(false)}>
            {links.map(([to, label]) => (
              <NavLink key={to} to={to} end className={navClass}>
                {label}
              </NavLink>
            ))}
            {user ? (
              <>
                <NavLink to="/notifications" className={navClass} aria-label={`Notifications, ${unread} unread`}>
                  🔔{unread > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{unread}</span>}
                </NavLink>
                <button className="btn-secondary" onClick={() => { logout(); navigate('/'); }}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={navClass}>Sign in</NavLink>
                <Link to="/register" className="btn-primary">Join</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-slate-500">
          <p className="font-semibold text-red-700">
            Not for emergencies. If someone is seriously ill or injured, call your local emergency number now.
          </p>
          <p className="mt-1">
            Care Marketplace connects you with independent, verified professionals. It does not diagnose or prescribe; clinical decisions are made by
            the licensed professional you book.
          </p>
        </div>
      </footer>
    </div>
  );
}
