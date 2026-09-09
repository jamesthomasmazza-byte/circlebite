import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import {
  ApiRequestError,
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  type CurrentUser,
} from "./api";

type AuthState = {
  user: CurrentUser | null;
  actingProfileId: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [actingProfileId, setActingProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await fetchMe();
      setUser(me.user);
      setActingProfileId(me.actingProfileId);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        setUser(null);
        setActingProfileId(null);
      } else {
        throw err;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      await apiLogin(email, password);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setActingProfileId(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, actingProfileId, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
