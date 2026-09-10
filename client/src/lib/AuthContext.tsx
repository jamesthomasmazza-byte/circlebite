import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  type CurrentUser,
} from "./api";

type AuthState = {
  user: CurrentUser | null;
  actingProfileId: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; displayName: string; dob: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [actingProfileId, setActingProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // refresh() runs both at mount (before any session cookie exists) and after login/register
  // (after one is set). Without a guard, a slow mount-time response arriving AFTER a later
  // refresh() call could overwrite that later call's result — e.g. clobbering a just-completed
  // login back to logged-out. requestIdRef makes only the most recently started call allowed to
  // commit state; a stale response that resolves late is discarded instead.
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const me = await fetchMe();
      if (requestIdRef.current !== requestId) return;
      setUser(me.user);
      setActingProfileId(me.actingProfileId);
    } catch {
      // Any failure to confirm identity — 401 or a transient network/server error — just means
      // we don't currently know who's logged in. Never rethrow: login()/register() call this
      // right after their own request already succeeded, and a hiccup here must not surface as
      // a false "something went wrong" on a registration or login that actually went through.
      if (requestIdRef.current !== requestId) return;
      setUser(null);
      setActingProfileId(null);
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
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

  const register = useCallback(
    async (input: { email: string; password: string; displayName: string; dob: string }) => {
      await apiRegister(input);
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
    <AuthContext.Provider value={{ user, actingProfileId, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
