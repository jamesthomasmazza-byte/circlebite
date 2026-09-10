import type { ProfileAllergen } from "../matcher/match.js";

export type { ProfileAllergen };

/** Shape of one per-allergen finding in reasonVerdict()'s output, per docs/verdict-engine.md. */
export type AiFinding = {
  allergen: string;
  present: "yes" | "trace" | "no" | "unknown";
  citedSpan: string;
  reason: string;
  confidence: "high" | "medium" | "low";
};

/** Discriminated result from a single call to the AI provider — see aiClient.ts. */
export type AiClientResult =
  | {
      ok: true;
      findings: AiFinding[];
      unresolvedTerms: string[];
      latencyMs: number;
      tokensIn: number;
      tokensOut: number;
      costCents: number;
    }
  | { ok: false; reason: string };

export type ReasonVerdictResult = {
  findings: AiFinding[];
  unresolvedTerms: string[];
  /** true only when the call itself failed (network/timeout/unparseable/spend-capped) — distinct
   *  from a successful call that simply found nothing, which callers must not treat the same way
   *  (see mergeVerdict.ts rule 4). */
  failed: boolean;
  /** Why `failed` is true — "no_api_key", "spend_cap_exceeded", "unparseable_response", an
   *  "api_error_<status>" from the provider, or "request_failed" for anything else (network error,
   *  timeout). Null when failed is false. Stored alongside the scan so a failure can actually be
   *  diagnosed from the database instead of an empty findings array that could mean anything. */
  failureReason: string | null;
  model: string;
  promptVersion: string;
  latencyMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  costCents: number | null;
};
