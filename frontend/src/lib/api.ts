const TOKEN_KEY = 'care.token';

export class ApiError extends Error {
  status: number;
  details?: { path: string; message: string }[];
  constructor(status: number, message: string, details?: { path: string; message: string }[]) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable: session lasts until reload */
    }
  },
};

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`/api${path}`, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers: {
      ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = data.details as ApiError['details'];
    const message = details?.length ? `${data.error}: ${details.map((d) => `${d.path ? d.path + ' — ' : ''}${d.message}`).join('; ')}` : data.error;
    throw new ApiError(res.status, message ?? 'Request failed', details);
  }
  return data as T;
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');
