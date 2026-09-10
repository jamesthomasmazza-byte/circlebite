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

export type ReasonVerdictResult = {
  findings: AiFinding[];
  unresolvedTerms: string[];
  /** true only when the call itself failed (network/timeout/unparseable/spend-capped) — distinct
   *  from a successful call that simply found nothing, which callers must not treat the same way
   *  (see mergeVerdict.ts rule 4). */
  failed: boolean;
  model: string;
  promptVersion: string;
  latencyMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  costCents: number | null;
};
