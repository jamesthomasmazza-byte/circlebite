import type { AllergenVerdictDetail, Severity, Verdict } from "../matcher/match.js";
import type { AiFinding, ProfileAllergen, ReasonVerdictResult } from "./types.js";

export type MergedClassification = "contains" | "caution" | "clear" | "unresolved";
export type Confidence = "high" | "medium" | "low";

export type MergedAllergenDetail = {
  allergenName: string;
  severity: Severity;
  classification: MergedClassification;
  source: "deterministic" | "ai";
  citedSpan?: string;
  reason?: string;
};

export type MergeResult = {
  verdict: Verdict;
  confidence: Confidence;
  matchedAllergens: MergedAllergenDetail[];
};

/**
 * Per-allergen merge, safety rules 1-2 (docs/verdict-engine.md) enforced structurally rather than
 * by convention:
 *  - "contains" (deterministic) never changes — the AI's input is irrelevant once the keyword
 *    matcher already found the allergen; there is nothing for it to escalate.
 *  - "caution" (a trace-tag match) can only escalate to "contains", on an AI-reported present:
 *    "yes" — it can never be cleared back to "clear".
 *  - "clear" can escalate to "contains" or "caution" depending on what the AI (and, for a "trace"
 *    finding, the allergen's own treatTracesAsUnsafe) reports. present: "unknown" — or a positive
 *    claim whose span reasonVerdict.ts already downgraded to "unknown" for failing validation —
 *    becomes "unresolved", never silently "clear": real uncertainty the model raised, not silence.
 *  - When reasonVerdict.ts itself failed, no finding exists for any allergen, so every "clear"
 *    allergen simply stays "clear" here; the ai.failed override below is what turns an otherwise-
 *    "safe" overall verdict into "unable_to_confirm" (rule 1 and rule 4) without touching allergens
 *    that were already unsafe (rule 4 — "an AI failure changes nothing" when there's already a
 *    contains or caution).
 */
function classifyAllergen(
  det: AllergenVerdictDetail,
  finding: AiFinding | undefined,
  treatTracesAsUnsafe: boolean,
): Pick<MergedAllergenDetail, "classification" | "source" | "citedSpan" | "reason"> {
  if (det.classification === "contains") {
    return { classification: "contains", source: "deterministic" };
  }

  if (det.classification === "caution") {
    if (finding?.present === "yes") {
      return { classification: "contains", source: "ai", citedSpan: finding.citedSpan, reason: finding.reason };
    }
    return { classification: "caution", source: "deterministic" };
  }

  // det.classification === "clear"
  if (!finding || finding.present === "no") {
    return { classification: "clear", source: "deterministic" };
  }
  if (finding.present === "unknown") {
    return { classification: "unresolved", source: "ai", reason: finding.reason };
  }
  if (finding.present === "trace") {
    return {
      classification: treatTracesAsUnsafe ? "contains" : "caution",
      source: "ai",
      citedSpan: finding.citedSpan,
      reason: finding.reason,
    };
  }
  // finding.present === "yes"
  return { classification: "contains", source: "ai", citedSpan: finding.citedSpan, reason: finding.reason };
}

function rollupVerdict(details: MergedAllergenDetail[]): Verdict {
  if (details.some((d) => d.classification === "contains")) return "contains_allergen";
  if (details.some((d) => d.classification === "unresolved")) return "unable_to_confirm";
  if (details.some((d) => d.classification === "caution")) return "may_contain_caution";
  return "safe";
}

export function mergeVerdict(
  deterministic: AllergenVerdictDetail[],
  ai: ReasonVerdictResult,
  allergens: ProfileAllergen[],
): MergeResult {
  const treatTracesAsUnsafeByName = new Map(allergens.map((a) => [a.name.toLowerCase(), a.treatTracesAsUnsafe]));
  const aiByName = new Map(ai.findings.map((f) => [f.allergen.toLowerCase(), f]));

  const matchedAllergens: MergedAllergenDetail[] = deterministic.map((det) => {
    const key = det.allergenName.toLowerCase();
    const finding = ai.failed ? undefined : aiByName.get(key);
    return {
      allergenName: det.allergenName,
      severity: det.severity,
      ...classifyAllergen(det, finding, treatTracesAsUnsafeByName.get(key) ?? false),
    };
  });

  let verdict = rollupVerdict(matchedAllergens);
  // Rule 1 + rule 4: an AI failure can never be silent when it was the only thing standing
  // between "nothing the keyword matcher recognized" and calling the product safe. It changes
  // nothing when the deterministic pass already found something unsafe (nothing to escalate away
  // from).
  if (ai.failed && verdict === "safe") verdict = "unable_to_confirm";

  // This slice (Path B) only ever reasons over free ingredient text — never structured tags
  // (that's Path A) or OCR (Path C/D) — so "high" and the OCR-flavored parts of "low" in the
  // confidence-band table don't apply here. unable_to_confirm reports low; everything else medium.
  const confidence: Confidence = verdict === "unable_to_confirm" ? "low" : "medium";

  return { verdict, confidence, matchedAllergens };
}
