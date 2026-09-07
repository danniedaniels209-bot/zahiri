import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, setToken, getToken, type User } from './api';

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (patch: Partial<User>) => Promise<void>;
}

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  role?: 'user' | 'ambassador' | 'journalist' | 'org';
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const { user: me } = await api<{ user: User }>('/api/auth/me');
      setUser(me);
    } catch (err) {
      // 401 already cleared the stored token in the api layer.
      if (!(err instanceof ApiError) || err.status === 401) setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      auth: false,
      body: { email: email.trim().toLowerCase(), password },
    });
    await setToken(res.token);
    setUser(res.user);
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    const res = await api<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      auth: false,
      body: { ...input, email: input.email.trim().toLowerCase() },
    });
    await setToken(res.token);
    setUser(res.user);
  }, []);

  const signOut = useCallback(async () => {
    await setToken(null);
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (patch: Partial<User>) => {
    const res = await api<{ user: User }>('/api/auth/me', { method: 'PATCH', body: patch });
    setUser(res.user);
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signOut, refresh: loadSession, updateProfile }),
    [user, loading, signIn, signUp, signOut, loadSession, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
