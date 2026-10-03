import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ErrorBox } from '../components/ui';

const DEMO = [
  ['Patient', 'patient@example.com', 'Patient@123'],
  ['Provider', 'amaka@example.com', 'Provider@123'],
  ['Admin', 'admin@care.example', 'Admin@12345'],
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const user = await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? (user.role === 'ADMIN' ? '/admin' : user.role === 'PROVIDER' ? '/bookings' : '/'));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <form onSubmit={submit} className="card space-y-4">
        <h1 className="text-xl font-bold text-ink">Sign in</h1>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <ErrorBox error={error} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="text-center text-sm text-slate-600">
          New here? <Link to="/register" className="font-medium text-brand-800 hover:underline">Create an account</Link>
        </p>
      </form>
      {import.meta.env.DEV && (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-600">
          <p className="mb-2 font-semibold">Demo accounts (seed data)</p>
          <div className="flex flex-wrap gap-2">
            {DEMO.map(([label, e, p]) => (
              <button key={label} className="btn-secondary px-2 py-1 text-xs" onClick={() => { setEmail(e); setPassword(p); }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
