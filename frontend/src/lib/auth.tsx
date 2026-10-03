import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, tokenStore } from './api';
import type { Role, User } from './types';

interface RegisterInput {
  email: string;
  password: string;
  name: string;
  phone?: string;
  country: string;
  role: Exclude<Role, 'ADMIN'>;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null);
      return;
    }
    try {
      setUser(await api<User>('/auth/me'));
    } catch {
      tokenStore.set(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const signIn = async (path: string, body: unknown) => {
    const { token } = await api<{ token: string; user: User }>(path, { body });
    tokenStore.set(token);
    queryClient.clear();
    const me = await api<User>('/auth/me');
    setUser(me);
    return me;
  };

  const value: AuthState = {
    user,
    loading,
    login: (email, password) => signIn('/auth/login', { email, password }),
    register: (input) => signIn('/auth/register', input),
    logout: () => {
      tokenStore.set(null);
      queryClient.clear();
      setUser(null);
    },
    refresh,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
