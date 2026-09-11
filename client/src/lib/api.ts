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

export type CurrentUser = { id: string; email: string; displayName: string; isAdmin: boolean };

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

export type ShareLevel = "all" | "severe_only";

export type CircleData = {
  pendingFollows: { id: string; share_level: ShareLevel; message: string | null; created_at: string }[];
  followers: {
    id: string;
    share_level: ShareLevel;
    responded_at: string;
    display_name: string;
    email: string;
  }[];
  pendingManagerInvites: { id: string; created_at: string }[];
  managers: { user_id: string; added_at: string; display_name: string; email: string }[];
};

export function getCircle(profileId: string): Promise<CircleData> {
  return apiFetch(`/profiles/${profileId}/circle`);
}

export function createFollowInvite(
  profileId: string,
  input: { shareLevel: ShareLevel; message?: string },
): Promise<{ id: string; token: string }> {
  return apiFetch(`/profiles/${profileId}/follow-invites`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function revokeFollow(profileId: string, followId: string): Promise<void> {
  return apiFetch(`/profiles/${profileId}/follows/${followId}/revoke`, { method: "POST" });
}

export function createManagerInvite(profileId: string): Promise<{ id: string; token: string }> {
  return apiFetch(`/profiles/${profileId}/manager-invites`, { method: "POST" });
}

export function removeManager(profileId: string, userId: string): Promise<void> {
  return apiFetch(`/profiles/${profileId}/managers/${userId}`, { method: "DELETE" });
}

export function getFollowInvite(
  token: string,
): Promise<{ profileLabel: string; shareLevel: ShareLevel; status: "pending" | "accepted" | "revoked" }> {
  return apiFetch(`/follow/${token}`);
}

export function acceptFollowInvite(token: string): Promise<{ allergenProfileId: string }> {
  return apiFetch(`/follow/${token}/accept`, { method: "POST" });
}

export function getCoManagerInvite(
  token: string,
): Promise<{ profileLabel: string; status: "pending" | "accepted" | "revoked" }> {
  return apiFetch(`/co-manager/${token}`);
}

export function acceptCoManagerInvite(token: string): Promise<{ allergenProfileId: string }> {
  return apiFetch(`/co-manager/${token}/accept`, { method: "POST" });
}

export type MatchSource = "tag" | "ingredients" | "trace";
// "unresolved" only ever appears on a scan that ran the AI reasoning step (docs/verdict-engine.md
// Path B) — the model raised real uncertainty about this allergen rather than staying silent, so
// it's shown distinctly from "clear" rather than folded into it.
export type Classification = "contains" | "caution" | "clear" | "unresolved";
export type Verdict = "safe" | "contains_allergen" | "may_contain_caution" | "unable_to_confirm";
export type Confidence = "high" | "medium" | "low";

export type MatchedAllergen = {
  allergenName: string;
  matched: boolean;
  source: MatchSource | null;
  severity: Severity;
  classification: Classification;
  // Present (and true) only when the AI reasoning step changed this allergen's classification
  // from what the deterministic keyword matcher alone found.
  aiEscalated?: boolean;
  citedSpan?: string;
  // Present (and true) only when a corroborated community report — not the product data or the AI
  // — is why this allergen shows as "contains". docs/principles.md principle 7: "shoppers told
  // us" is a different claim from "the label says", and the card must say which one it is.
  communityReported?: boolean;
  communityReporterCount?: number;
};

// Which of this profile's allergens a corroborated community report changed, and how many people
// reported it. Never the reporters themselves or how their own profiles spelled the allergen.
export type CommunityReport = { allergenName: string; reporterCount: number };

export type ScanResult = {
  id: string;
  barcode: string;
  product_name: string | null;
  product_brand: string | null;
  ingredients_text: string | null;
  product_last_updated: string | null;
  result: Verdict;
  matched_allergens: MatchedAllergen[];
  source: "barcode" | "label_photo" | "manual";
  confidence: Confidence | null;
  explanation: string | null;
  created_at: string;
  // `result`/`matched_allergens` above are always the engine's own verdict. `effective` is set
  // only when a corroborated community report escalated it — the card headlines `effective` and
  // still shows the engine's verdict alongside it, never silently replacing it.
  effective: { result: Verdict; matched_allergens: MatchedAllergen[] } | null;
  community_reports: CommunityReport[];
};

export type CorrectionType = "flag_wrong" | "flag_missing" | "wrong_product";
export type CorrectionStatus = "pending" | "corroborated" | "rejected";

export type ScanCorrection = {
  id: string;
  correctionType: CorrectionType;
  direction: "add_caution" | "remove_caution";
  allergen: string | null;
  note: string | null;
  status: CorrectionStatus;
  createdAt: string;
};

export type ScanHistoryEntry = {
  id: string;
  barcode: string;
  product_name: string | null;
  product_brand: string | null;
  created_at: string;
  original: { result: Verdict; matched_allergens: MatchedAllergen[] };
  // CONTEST_RULES.md §3: the requester's own correction(s) override their view immediately, and
  // corroborated community reports that an allergen is present escalate it — never in place of
  // `original`, always alongside it, so the UI can show both and be transparent about what
  // changed. null when neither changed anything on this scan.
  effective: { result: Verdict; matched_allergens: MatchedAllergen[] } | null;
  corrections: ScanCorrection[];
  // Filtered to what this viewer's share level shows, same as matched_allergens.
  community_reports: CommunityReport[];
};

export function createScan(allergenProfileId: string, barcode: string): Promise<ScanResult> {
  return apiFetch("/scans", { method: "POST", body: JSON.stringify({ allergenProfileId, barcode }) });
}

export function getScanHistory(profileId: string): Promise<ScanHistoryEntry[]> {
  return apiFetch(`/profiles/${profileId}/scans`);
}

export type CorrectionResult = { id: string; status: CorrectionStatus; corroborated: boolean };

/**
 * multipart/form-data, not the JSON apiFetch() helper above — a File can't be JSON-serialized, and
 * manually setting Content-Type on a FormData body would break the multipart boundary the browser
 * needs to set itself.
 */
export async function createCorrection(
  scanId: string,
  input: { correctionType: CorrectionType; allergen: string | null; note: string | null; photo: File },
): Promise<CorrectionResult> {
  const form = new FormData();
  form.set("correctionType", input.correctionType);
  if (input.allergen) form.set("allergen", input.allergen);
  if (input.note) form.set("note", input.note);
  form.set("photo", input.photo);

  const res = await fetch(`/api/scans/${scanId}/corrections`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const body = await res.json().catch(() => undefined);

  if (!res.ok) {
    const code = (body as { error?: string } | undefined)?.error ?? `request_failed_${res.status}`;
    throw new ApiRequestError(code, res.status);
  }

  return body as CorrectionResult;
}

export type AccuracyBucket = { escalations: number; overruled: number; rate: number | null };
export type AccuracyCategoryBuckets = { escalation: AccuracyBucket; unresolved: AccuracyBucket };
export type AccuracyAllergenRow = AccuracyCategoryBuckets & { allergen: string };
export type AccuracyModelRow = AccuracyCategoryBuckets & { model: string; promptVersion: string };

export type AiAccuracyReport = {
  threshold: number;
  generatedAt: string;
  overall: AccuracyCategoryBuckets;
  byAllergen: AccuracyAllergenRow[];
  byModelPromptVersion: AccuracyModelRow[];
  misses: { reportedMisses: number; aiReviewedScans: number };
  failures: { totalAttempts: number; totalFailures: number; rate: number | null; byReason: { reason: string; count: number }[] };
};

export function getAiAccuracyReport(): Promise<AiAccuracyReport> {
  return apiFetch("/admin/ai-accuracy");
}
