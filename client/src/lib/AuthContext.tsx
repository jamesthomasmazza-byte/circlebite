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
  // Path C's kill switch (server env.labelScan), carried on the same /me response the app already
  // fetches at mount — not a second round trip. Defaults to false (fail closed, same as every
  // other kill switch in this app) until the first successful refresh() resolves, and again on any
  // refresh() failure — an unauthenticated or errored state must not offer a feature whose gate we
  // couldn't actually confirm.
  labelScanEnabled: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; displayName: string; dob: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [actingProfileId, setActingProfileId] = useState<string | null>(null);
  const [labelScanEnabled, setLabelScanEnabled] = useState(false);
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
      setLabelScanEnabled(me.labelScanEnabled);
    } catch {
      // Any failure to confirm identity — 401 or a transient network/server error — just means
      // we don't currently know who's logged in. Never rethrow: login()/register() call this
      // right after their own request already succeeded, and a hiccup here must not surface as
      // a false "something went wrong" on a registration or login that actually went through.
      if (requestIdRef.current !== requestId) return;
      setUser(null);
      setActingProfileId(null);
      setLabelScanEnabled(false);
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const authUser = await apiLogin(email, password);
      // A brand new session from a fresh login always starts with no acting profile selected, so
      // that's known without a fetch — set it and the user directly for instant feedback. But
      // labelScanEnabled genuinely isn't known from the login response, so refresh() still runs
      // right after to pick it up (and to reconcile everything else from the server, redundantly
      // but harmlessly) — this is the "login()/register() call this right after their own request
      // already succeeded" refresh() itself already anticipated in its own comment above.
      requestIdRef.current += 1;
      setUser(authUser);
      setActingProfileId(null);
      await refresh();
    },
    [refresh],
  );

  const register = useCallback(
    async (input: { email: string; password: string; displayName: string; dob: string }) => {
      const authUser = await apiRegister(input);
      requestIdRef.current += 1;
      setUser(authUser);
      setActingProfileId(null);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      // Always clear local state, even if the server call failed (network error, 5xx) — the
      // user must not be stuck looking logged-in with no way back to /login short of a reload.
      setUser(null);
      setActingProfileId(null);
      setLabelScanEnabled(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, actingProfileId, labelScanEnabled, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
