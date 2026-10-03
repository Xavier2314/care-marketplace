import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { COUNTRIES } from '../lib/format';
import { ErrorBox } from '../components/ui';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState<'PATIENT' | 'PROVIDER'>(params.get('role') === 'provider' ? 'PROVIDER' : 'PATIENT');
  const [form, setForm] = useState({ name: '', email: '', phone: '', country: 'NG', password: '' });
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await register({ ...form, phone: form.phone || undefined, role });
      navigate(role === 'PROVIDER' ? '/provider' : '/');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <form onSubmit={submit} className="card space-y-4">
        <h1 className="text-xl font-bold text-ink">Create your account</h1>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
          {([
            ['PATIENT', 'I need care', 'For myself or a family member'],
            ['PROVIDER', 'I provide care', 'Caregiver, nurse, doctor, physio'],
          ] as const).map(([value, title, hint]) => (
            <button
              type="button"
              role="radio"
              aria-checked={role === value}
              key={value}
              onClick={() => setRole(value)}
              className={`rounded-lg border p-3 text-left ${role === value ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200'}`}
            >
              <div className="text-sm font-semibold">{title}</div>
              <div className="text-xs text-slate-600">{hint}</div>
            </button>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" className="input" autoComplete="name" value={form.name} onChange={set('name')} required minLength={2} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" className="input" value={form.email} onChange={set('email')} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="phone">Phone (optional)</label>
            <input id="phone" type="tel" autoComplete="tel" className="input" value={form.phone} onChange={set('phone')} />
          </div>
          <div>
            <label className="label" htmlFor="country">Country</label>
            <select id="country" className="input" value={form.country} onChange={set('country')}>
              {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="new-password" className="input" value={form.password} onChange={set('password')} required minLength={8} />
          <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
        </div>
        {role === 'PROVIDER' && (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            After signing up you'll add your profile, licence or certificate, services and availability. Our team verifies every professional
            before they appear in search.
          </p>
        )}
        <ErrorBox error={error} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
        <p className="text-center text-sm text-slate-600">
          Already have an account? <Link to="/login" className="font-medium text-brand-800 hover:underline">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
