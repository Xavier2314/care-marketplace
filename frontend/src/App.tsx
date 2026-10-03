import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import type { Role } from './lib/types';
import Home from './pages/Home';
import ProviderPage from './pages/ProviderPage';
import Login from './pages/Login';
import Register from './pages/Register';
import Bookings from './pages/Bookings';
import BookingDetail from './pages/BookingDetail';
import Notifications from './pages/Notifications';
import Help from './pages/Help';
import ProviderProfile from './pages/provider/ProviderProfile';
import Earnings from './pages/provider/Earnings';
import Admin from './pages/admin/Admin';

function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="providers/:id" element={<ProviderPage />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="bookings" element={<RequireAuth><Bookings /></RequireAuth>} />
        <Route path="bookings/:id" element={<RequireAuth><BookingDetail /></RequireAuth>} />
        <Route path="notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
        <Route path="help" element={<RequireAuth><Help /></RequireAuth>} />
        <Route path="provider" element={<RequireAuth roles={['PROVIDER']}><ProviderProfile /></RequireAuth>} />
        <Route path="provider/credentials" element={<Navigate to="/provider" replace />} />
        <Route path="provider/earnings" element={<RequireAuth roles={['PROVIDER']}><Earnings /></RequireAuth>} />
        <Route path="admin/*" element={<RequireAuth roles={['ADMIN']}><Admin /></RequireAuth>} />
        <Route path="*" element={<p className="text-center text-slate-600">Page not found.</p>} />
      </Route>
    </Routes>
  );
}
