export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  const body = await res.json().catch(() => undefined);

  if (!res.ok) {
    const code = (body as { error?: string } | undefined)?.error ?? `request_failed_${res.status}`;
    throw new ApiRequestError(code, res.status);
  }

  return body as T;
}

export type CurrentUser = { id: string; email: string; displayName: string };

export function fetchMe(): Promise<{ user: CurrentUser; actingProfileId: string | null }> {
  return apiFetch("/me");
}

export function login(email: string, password: string): Promise<CurrentUser> {
  return apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function logout(): Promise<{ ok: true }> {
  return apiFetch("/auth/logout", { method: "POST" });
}

export function register(input: {
  email: string;
  password: string;
  displayName: string;
  dob: string;
}): Promise<CurrentUser> {
  return apiFetch("/auth/register", { method: "POST", body: JSON.stringify(input) });
}
