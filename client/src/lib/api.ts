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

export function fetchMe(): Promise<{ user: CurrentUser; actingProfileId: string | null; labelScanEnabled: boolean }> {
  return apiFetch("/me");
}

export function login(email: string, password: string): Promise<CurrentUser> {
  return apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function logout(): Promise<{ ok: true }> {
  return apiFetch("/auth/logout", { method: "POST" });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true }> {
  return apiFetch("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function resetPassword(token: string, newPassword: string): Promise<{ ok: true }> {
  return apiFetch(`/auth/password-reset/${token}`, {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });
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
//
// "unchecked" (Path C only) is a different thing from "unresolved" on purpose — deliberately not
// named "unconfirmed", which reads as a near-synonym of "unresolved" and would get confused with it
// in a filter someday (docs/principles.md, Sept 26, 2026). "unresolved" is the AI actively raising a
// term it saw and couldn't settle; "unchecked" is nothing being found at all, on a photo scan where
// that absence isn't proof of absence. Rendered as a grouped summary naming every unchecked
// allergen at once, not one row each — see Scan.tsx/ScanHistory.tsx.
export type Classification = "contains" | "caution" | "clear" | "unresolved" | "unchecked";
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
  // True only when classification === "contains" arrived there by escalating an AI-reported
  // "may contain"/trace claim via this allergen's own treatTracesAsUnsafe, not direct evidence.
  // Mirrors server/src/verdict/mergeVerdict.ts's own field — see isTraceEscalatedToContains there
  // (and its client-side twin below) for why "contains" alone isn't enough to tell this apart from
  // a genuine direct finding: the label said "may contain," and the card has to say so, distinctly
  // from what the app decided to do about it.
  escalatedFromTrace?: boolean;
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
  // Null for a Path C scan with no barcode at all (docs/verdict-engine.md) — the standalone
  // "no barcode? photograph the label" entry point. A Path C scan reached from a failed barcode
  // scan (the reactive entry point) may still carry a real barcode here.
  barcode: string | null;
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
  // Path C only (source === "label_photo") — present so the user can check the read against the
  // physical package themselves (docs/verdict-engine.md Path C plan §5). Absent/null on a barcode
  // scan.
  extracted_text?: string | null;
  extraction_legible?: boolean;
  extraction_complete?: boolean;
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
  barcode: string | null;
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

// Anthropic's own resize threshold for Claude's vision input — images are downsized to roughly
// this before tiling into tokens, so sending a larger longest edge spends upload time (a real cost
// on a phone in a grocery aisle) without adding OCR fidelity server-side never re-downscales this;
// MAX_PHOTO_BYTES and sniffImageType there are the actual guards regardless of what a client sends.
const LABEL_PHOTO_MAX_DIMENSION = 1568;
const LABEL_PHOTO_JPEG_QUALITY = 0.85;

/**
 * Downscales a captured photo client-side via canvas before upload — a 4MB phone photo over
 * cellular vs. a few hundred KB. Never upscales a smaller image. Canvas resampling is lower
 * quality than a server-side Lanczos filter would be; if label reads measurably degrade because of
 * that specifically (not lighting/framing), revisit server-side downscaling — see the Path C plan.
 */
export async function downscaleLabelPhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LABEL_PHOTO_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file; // No canvas support — let the original file through; the server still validates it.
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", LABEL_PHOTO_JPEG_QUALITY));
  if (!blob) return file;
  return new File([blob], "label.jpg", { type: "image/jpeg" });
}

export type LabelScanResult = ScanResult & {
  extracted_text: string | null;
  extraction_legible: boolean;
  extraction_complete: boolean;
};

/**
 * multipart/form-data, same reasoning as createCorrection below — a File can't go through the
 * JSON apiFetch() helper. barcode is the carried-forward value from a failed barcode scan (the
 * reactive entry point) or omitted entirely for the standalone "no barcode" entry point; the
 * server re-validates it against Open Food Facts rather than trusting it as-is.
 */
export async function createLabelScan(
  allergenProfileId: string,
  photo: File,
  barcode?: string,
): Promise<LabelScanResult> {
  const form = new FormData();
  form.set("allergenProfileId", allergenProfileId);
  if (barcode) form.set("barcode", barcode);
  form.set("photo", photo);

  const res = await fetch("/api/scans/label", { method: "POST", credentials: "include", body: form });
  const body = await res.json().catch(() => undefined);

  if (!res.ok) {
    const code = (body as { error?: string } | undefined)?.error ?? `request_failed_${res.status}`;
    throw new ApiRequestError(code, res.status);
  }

  return body as LabelScanResult;
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

export type AccuracySourceRow = AccuracyCategoryBuckets & { source: string };

export type AiAccuracyReport = {
  threshold: number;
  generatedAt: string;
  overall: AccuracyCategoryBuckets;
  byAllergen: AccuracyAllergenRow[];
  byModelPromptVersion: AccuracyModelRow[];
  // Path C's reasoning call reuses Path B's prompt_version byte-for-byte, so byModelPromptVersion
  // alone can't separate their overrule rates — this is the breakdown that does.
  bySource: AccuracySourceRow[];
  misses: { reportedMisses: number; aiReviewedScans: number };
  failures: { totalAttempts: number; totalFailures: number; rate: number | null; byReason: { reason: string; count: number }[] };
};

export function getAiAccuracyReport(): Promise<AiAccuracyReport> {
  return apiFetch("/admin/ai-accuracy");
}

// Mirrors server/src/nps/recordNpsResponse.ts's NpsResponse exactly.
export type NpsResponse = { id: string; score: number; reason: string | null; createdAt: string };

export function getCurrentNpsResponse(): Promise<{ response: NpsResponse | null }> {
  return apiFetch("/nps/current");
}

export function submitNpsResponse(score: number, reason: string | null): Promise<NpsResponse> {
  return apiFetch("/nps", { method: "POST", body: JSON.stringify({ score, reason }) });
}

// Mirrors server/src/nps/npsReport.ts's NpsReport exactly. npsScore, not score, on purpose — a
// 0-10 individual rating (NpsResponse.score above) and a -100..+100 index are different units.
export type NpsReport = {
  threshold: number;
  n: number;
  promoters: number;
  passives: number;
  detractors: number;
  npsScore: number | null;
  reasons: string[];
  realCount: number;
  seededCount: number;
  /** True when npsScore is non-null only because seeded rows pushed n over the threshold. */
  seedCarriedScore: boolean;
};

export function getNpsReport(): Promise<NpsReport> {
  return apiFetch("/admin/nps");
}

// Mirrors server/src/corrections/reviewQueue.ts's ReviewQueueReport/ReviewQueueClaim exactly.
// Deliberately no email field anywhere here — reporter identity never leaves the server (see that
// module's docs and docs/principles.md's precedent row); only rejector identity does, since that's
// admin accountability rather than a user's health data.
export type ReviewQueueReport = {
  id: string;
  correctionType: CorrectionType;
  target: "off_data" | "ai_verdict";
  note: string | null;
  status: CorrectionStatus;
  createdAt: string;
  reporterLabel: string;
  rejectedBy: { email: string } | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
};

export type ReviewQueueClaim = {
  // Null for a claim built from a barcode-less Path C scan's correction — always a singleton (see
  // reviewQueue.ts's groupIntoClaims), shown in its own non-corroborating section.
  barcode: string | null;
  allergen: string | null;
  direction: "add_caution" | "remove_caution";
  status: CorrectionStatus;
  liveReporterCount: number;
  deletedAccountReportCount: number;
  sameCircleWarning: boolean;
  reports: ReviewQueueReport[];
};

export function getReviewQueue(): Promise<ReviewQueueClaim[]> {
  return apiFetch("/admin/review-queue");
}

// Return shape matches ReviewQueueReport.rejectedBy's { email: string } exactly (non-nullable here
// — this is always the acting admin's own row) so the caller can patch this response straight into
// one report's rejectedBy field in local state without reshaping it.
export function rejectCorrection(
  correctionId: string,
  reason: string | null,
): Promise<{ id: string; status: "rejected"; rejectedBy: { email: string }; rejectedAt: string; rejectionReason: string | null }> {
  return apiFetch(`/admin/review-queue/corrections/${correctionId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// Photo is a plain <img>/<a> pointing at GET /api/admin/review-queue/corrections/:id/photo — no
// fetch helper needed, same as every other served-file link in the app.
export function reviewQueuePhotoUrl(correctionId: string): string {
  return `/api/admin/review-queue/corrections/${correctionId}/photo`;
}

export type DeletionImpactProfile = {
  id: string;
  label: string;
  scanCount: number;
  outcome:
    | { type: "transfer"; newOwner: { displayName: string; email: string } }
    | { type: "destroy"; followerCount: number };
};

export function getDeletionImpact(): Promise<{ profiles: DeletionImpactProfile[] }> {
  return apiFetch("/account/deletion-impact");
}

export function deleteAccount(): Promise<void> {
  return apiFetch("/account", { method: "DELETE" });
}
