import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../config/api.js';
import { clearStoredToken, getStoredToken, setStoredToken } from '../features/auth/tokenStorage.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken());
  const [user, setUser] = useState(null);

  const isAuthenticated = Boolean(token);

  const login = useCallback(async ({ email, password }) => {
    const response = await api.post('/auth/login', { email, password });
    const session = response.data.data;
    const accessToken = session.accessToken.token;

    setStoredToken(accessToken);
    setToken(accessToken);
    setUser(session.user);

    return session;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (getStoredToken()) {
        await api.post('/auth/logout');
      }
    } finally {
      clearStoredToken();
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function hydrateUser() {
      if (!token || user) {
        return;
      }

      try {
        const response = await api.get('/auth/me');

        if (isMounted) {
          setUser(response.data.data);
        }
      } catch {
        if (isMounted) {
          clearStoredToken();
          setToken(null);
          setUser(null);
        }
      }
    }

    hydrateUser();

    return () => {
      isMounted = false;
    };
  }, [token, user]);

  const value = useMemo(
    () => ({
      isAuthenticated,
      token,
      user,
      login,
      logout
    }),
    [isAuthenticated, login, logout, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
