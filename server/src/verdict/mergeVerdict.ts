import type { AllergenVerdictDetail, Verdict } from "../matcher/match.js";
import type { AiFinding, ProfileAllergen, ReasonVerdictResult } from "./types.js";

// "unchecked" is deliberately its own word, not "unconfirmed" — that reads as a near-synonym of
// "unresolved" and the two would get confused in a filter someday, which in this path is a safety
// bug, not a typo. The two mean structurally different things: "unresolved" is the AI actively
// raising a term it saw and couldn't settle; "unchecked" is nothing being found at all, on a scan
// where absence of a hit isn't proof of absence (docs/principles.md's Sept 26, 2026 precedent).
export type MergedClassification = "contains" | "caution" | "clear" | "unresolved" | "unchecked";
export type Confidence = "high" | "medium" | "low";

/**
 * Deliberately keeps `matched`/`source` as the deterministic matcher's own fields, unchanged —
 * that's what today's verdict card already renders ("listed ingredient" / "found in ingredient
 * text" / "may contain traces"), and Path B is additive to it, not a replacement. `classification`
 * is the final, post-merge outcome; `aiEscalated` says whether the AI changed it from what the
 * deterministic pass alone produced, and `citedSpan`/`reason` are only ever set when it did.
 */
export type MergedAllergenDetail = Omit<AllergenVerdictDetail, "classification"> & {
  classification: MergedClassification;
  aiEscalated: boolean;
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
 *    allergen simply stays "clear" here (or "unchecked" on a photoSourced merge — see below); the
 *    ai.failed override further down is what turns an otherwise-"safe" overall verdict into
 *    "unable_to_confirm" (rule 1 and rule 4) without touching allergens that were already unsafe
 *    (rule 4 — "an AI failure changes nothing" when there's already a contains or caution).
 *  - photoSourced changes only the "clear" outcome, to "unchecked": on a barcode scan, "no keyword
 *    hit and the AI said no/nothing" is real evidence of absence (Path A/B's controlled tag
 *    vocabulary and free ingredient text). On a photo scan, neither side saw the label's separate
 *    contains/may-contain statement at all — the deterministic pass only exact-matches the
 *    extracted text against a fixed keyword list, and reasonVerdict is never given that text to
 *    reason over — so absence of a hit isn't evidence of absence the way it is on Path A/B.
 *    Uniform regardless of *why* "clear" would have resulted (no finding at all, an explicit AI
 *    "no" over ingredients_text, or ai.failed): none of those saw the contains/may-contain
 *    statement either, so none of them earn more trust than the others.
 */
function classifyAllergen(
  det: AllergenVerdictDetail,
  finding: AiFinding | undefined,
  treatTracesAsUnsafe: boolean,
  photoSourced: boolean,
): Pick<MergedAllergenDetail, "classification" | "aiEscalated" | "citedSpan" | "reason"> {
  if (det.classification === "contains") {
    return { classification: "contains", aiEscalated: false };
  }

  if (det.classification === "caution") {
    if (finding?.present === "yes") {
      return { classification: "contains", aiEscalated: true, citedSpan: finding.citedSpan, reason: finding.reason };
    }
    return { classification: "caution", aiEscalated: false };
  }

  // det.classification === "clear"
  if (!finding || finding.present === "no") {
    return { classification: photoSourced ? "unchecked" : "clear", aiEscalated: false };
  }
  if (finding.present === "unknown") {
    return { classification: "unresolved", aiEscalated: true, reason: finding.reason };
  }
  if (finding.present === "trace") {
    return {
      classification: treatTracesAsUnsafe ? "contains" : "caution",
      aiEscalated: true,
      citedSpan: finding.citedSpan,
      reason: finding.reason,
    };
  }
  // finding.present === "yes"
  return { classification: "contains", aiEscalated: true, citedSpan: finding.citedSpan, reason: finding.reason };
}

function rollupVerdict(details: MergedAllergenDetail[]): Verdict {
  if (details.some((d) => d.classification === "contains")) return "contains_allergen";
  // "unchecked" forces the same outcome as "unresolved" — same reasoning as the granularity
  // precedent (docs/principles.md, Sept 26, 2026): an override justified by "we can't see
  // everything" has to apply everywhere that claim is made. Without this, an all-"unchecked"
  // profile would match none of the checks below and fall through to "safe" — the exact bug this
  // classification exists to close, one function away from where it was fixed.
  if (details.some((d) => d.classification === "unresolved" || d.classification === "unchecked")) {
    return "unable_to_confirm";
  }
  if (details.some((d) => d.classification === "caution")) return "may_contain_caution";
  return "safe";
}

export type MergeVerdictOptions = {
  /** True for a Path C scan (docs/verdict-engine.md) — text read from a photographed label rather
   *  than Open Food Facts. Must be passed explicitly from scans.source, never inferred from
   *  whether a barcode is present or absent (a barcode-known Path C scan still has a barcode) or
   *  from the shape of the ingredient text itself. */
  photoSourced?: boolean;
};

export function mergeVerdict(
  deterministic: AllergenVerdictDetail[],
  ai: ReasonVerdictResult,
  allergens: ProfileAllergen[],
  options: MergeVerdictOptions = {},
): MergeResult {
  const treatTracesAsUnsafeByName = new Map(allergens.map((a) => [a.name.toLowerCase(), a.treatTracesAsUnsafe]));
  const aiByName = new Map(ai.findings.map((f) => [f.allergen.toLowerCase(), f]));

  const photoSourced = options.photoSourced ?? false;
  const matchedAllergens: MergedAllergenDetail[] = deterministic.map((det) => {
    const key = det.allergenName.toLowerCase();
    const finding = ai.failed ? undefined : aiByName.get(key);
    return {
      ...det,
      ...classifyAllergen(det, finding, treatTracesAsUnsafeByName.get(key) ?? false, photoSourced),
    };
  });

  let verdict = rollupVerdict(matchedAllergens);
  // Rule 1 + rule 4: an AI failure can never be silent when it was the only thing standing
  // between "nothing the keyword matcher recognized" and calling the product safe. It changes
  // nothing when the deterministic pass already found something unsafe (nothing to escalate away
  // from).
  if (ai.failed && verdict === "safe") verdict = "unable_to_confirm";

  // Redundant backstop, kept deliberately (same "defense in depth" posture as the in-app spend cap
  // on top of the console-side one): classifyAllergen's photoSourced branch above already means no
  // allergen can be "clear" on a photoSourced merge, so rollupVerdict can never actually return
  // "safe" here once at least one allergen exists — this line only still matters for the
  // degenerate case of a profile with zero allergens configured at all, where matchedAllergens is
  // empty and rollupVerdict's own fallthrough is the only thing that would otherwise say "safe".
  if (photoSourced && verdict === "safe") verdict = "unable_to_confirm";

  // Path B/C both only ever reason over free text (ingredient text or extracted label text) — never
  // structured tags (that's Path A) — so "high" in the confidence-band table doesn't apply here.
  // unable_to_confirm reports low (which also correctly covers the photoSourced override just
  // above — an OCR-sourced "nothing found" is exactly the "low" band's own OCR case); everything
  // else medium.
  const confidence: Confidence = verdict === "unable_to_confirm" ? "low" : "medium";

  return { verdict, confidence, matchedAllergens };
}
