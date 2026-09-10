export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  // Every API route lives under /api (see server/src/app.ts) specifically so it can never collide
  // with a client page route of the same name — callers here just use the bare resource path.
  const res = await fetch(`/api${path}`, {
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

export type Severity = "mild" | "moderate" | "severe";

export type Allergen = {
  id: string;
  name: string;
  severity: Severity;
  notes: string | null;
  treat_traces_as_unsafe: boolean;
};

export type ProfileSummary = {
  id: string;
  label: string;
  is_self: boolean;
  relationship?: "owner" | "co_manager";
  share_level?: "all" | "severe_only";
};

export type ProfileAccess =
  | { level: "owner" }
  | { level: "co_manager" }
  | { level: "follower"; shareLevel: "all" | "severe_only" };

export type ProfileDetail = {
  id: string;
  label: string;
  is_self: boolean;
  notes: string | null;
  default_treat_traces_as_unsafe: boolean;
  allergens: Allergen[];
  access: ProfileAccess;
};

export type AllergenInput = {
  name: string;
  severity: Severity;
  notes?: string;
  treatTracesAsUnsafe?: boolean;
};

export function listProfiles(): Promise<{ managed: ProfileSummary[]; followed: ProfileSummary[] }> {
  return apiFetch("/profiles");
}

export function createProfile(input: {
  label: string;
  isSelf?: boolean;
  notes?: string;
  allergens?: AllergenInput[];
}): Promise<ProfileDetail> {
  return apiFetch("/profiles", { method: "POST", body: JSON.stringify(input) });
}

export function getProfile(id: string): Promise<ProfileDetail> {
  return apiFetch(`/profiles/${id}`);
}

export function updateProfile(
  id: string,
  input: { label?: string; notes?: string; defaultTreatTracesAsUnsafe?: boolean },
): Promise<ProfileDetail> {
  return apiFetch(`/profiles/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteProfile(id: string): Promise<void> {
  return apiFetch(`/profiles/${id}`, { method: "DELETE" });
}

export function addAllergen(profileId: string, input: AllergenInput): Promise<Allergen> {
  return apiFetch(`/profiles/${profileId}/allergens`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAllergen(
  profileId: string,
  allergenId: string,
  input: Partial<AllergenInput>,
): Promise<Allergen> {
  return apiFetch(`/profiles/${profileId}/allergens/${allergenId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteAllergen(profileId: string, allergenId: string): Promise<void> {
  return apiFetch(`/profiles/${profileId}/allergens/${allergenId}`, { method: "DELETE" });
}
