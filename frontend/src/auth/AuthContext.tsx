import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getMe, login as apiLogin, logout as apiLogout } from '../api/client';

interface AuthContextValue {
  username: string | null;
  admin: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then((result) => {
        setUsername(result.username);
        setAdmin(Boolean(result.admin));
      })
      .catch(() => {
        setUsername(null);
        setAdmin(false);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (user: string, password: string) => {
    const result = await apiLogin(user, password);
    setUsername(result.username);
    setAdmin(Boolean(result.admin));
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUsername(null);
    setAdmin(false);
  }, []);

  const value = useMemo(
    () => ({ username, admin, loading, login, logout }),
    [username, admin, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
