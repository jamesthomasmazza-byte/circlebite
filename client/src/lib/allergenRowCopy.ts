import type { ScanResult } from "./api";

// The words on each allergen row of the verdict card: what the package claims (classificationLabel) and how
// we know (sourceLabel). Kept out of Scan.tsx so the one distinction this card must never lose —
// "contains" vs "may contain" — is under test (allergenRowCopy.test.ts). It has been a real bug once:
// the card read "Contains sesame" when the package said "may contain".

// matchedText: the verbatim ingredient text the matcher hit (server matcher/match.ts). Absent on tag
// and trace matches, and on any scan stored before the matcher kept it.
export type MatchedRow = ScanResult["matched_allergens"][number] & { matchedText?: string };

type Classification = MatchedRow["classification"];
type Source = NonNullable<MatchedRow["source"]>;

// Mirrors server/src/verdict/mergeVerdict.ts's own isTraceEscalatedToContains exactly — same rule,
// so the two never drift apart on what counts as "the label said 'may contain', the app treated it
// as unsafe" versus a genuine direct finding. communityReported is checked ahead of this at every
// call site (never inside this function) — a corroborated community report is a different claim
// from a trace escalation, and the two are the one case this rule alone can't tell apart: a
// deterministic trace tag (source: "trace", aiEscalated: false) that a *community* report — not
// treatTracesAsUnsafe — later escalated to "contains" would otherwise read as a false positive here.
export function isTraceEscalatedToContains(m: MatchedRow): boolean {
  if (m.classification !== "contains") return false;
  if (!m.aiEscalated) return m.source === "trace";
  return m.escalatedFromTrace === true;
}

// A Record, not a chain of ifs: a classification value added later without a label here is a
// compile error, not a silent fallthrough to some other value's words. "clear" and "unchecked" never
// render as rows (Scan.tsx filters them out) but still get honest words rather than borrowing one.
export const CLAIM_LABEL: Record<Classification, string> = {
  contains: "contains",
  caution: "may contain traces",
  unresolved: "couldn't confirm from the label text",
  clear: "not found",
  unchecked: "not checked",
};

export function classificationLabel(m: MatchedRow): string {
  // The label's own claim was a trace; this profile's trace rule is what made it unsafe. The claim
  // line says what the package said — the row's colour and weight say what the app decided.
  if (!m.communityReported && isTraceEscalatedToContains(m)) return 'label says "may contain"';
  return CLAIM_LABEL[m.classification];
}

export function shopperCount(n: number): string {
  return n === 1 ? "1 shopper" : `${n} shoppers`;
}

// Where each deterministic source is listed, by where the row's evidence came from. A Record for the
// same reason as CLAIM_LABEL. Says where the claim came from, never the claim again — one fact per
// line.
export const SOURCE_LABEL: Record<Source, { record: string; photo: string }> = {
  // Tags are structured data with no text behind them to quote — say where they are listed, and
  // never fill the slot with a quote the source didn't contain.
  tag: { record: "listed on the product record", photo: "listed on the label you photographed" },
  // The one source with real text: sourceLabel appends the verbatim matchedText when it exists.
  ingredients: { record: "found in ingredient text", photo: "found in ingredient text" },
  trace: { record: "allergen warning on the product record", photo: "allergen warning on the label you photographed" },
};

export function sourceLabel(m: MatchedRow, scan: Pick<ScanResult, "source">): string {
  // docs/principles.md principle 7: a community report is a different claim from the label data,
  // and says so on the card rather than borrowing the label's authority.
  if (m.communityReported) {
    return `reported by ${shopperCount(m.communityReporterCount ?? 1)} with a label photo — not in the product data`;
  }
  // The label's own claim (a trace) and the app's decision (treat it as unsafe, because this
  // profile flags traces) are two separate statements — never collapse them into "contains", which
  // is a claim the label itself never made. Checked before the AI-escalated branch below, since a
  // trace escalation is very often AI-driven and would otherwise be caught by it first.
  if (isTraceEscalatedToContains(m)) return "treated as unsafe because this profile flags traces";
  // AI-escalated findings carry their own citedSpan rather than the deterministic source
  // (tag/ingredients/trace) — the deterministic matcher found nothing for these, that's exactly
  // why the AI reasoning step ran.
  if (m.aiEscalated) {
    return m.citedSpan ? `AI review — "${m.citedSpan}"` : "flagged by AI review";
  }
  if (!m.source) return "not found";
  // A row came from the photographed label on a photo scan, and on a combined scan when
  // reconciliation took the label's side.
  const fromPhoto = scan.source === "label_photo" || (scan.source === "combined" && m.evidenceSource === "label");
  const label = SOURCE_LABEL[m.source][fromPhoto ? "photo" : "record"];
  // Quote exactly what matched, so it can be found on the package.
  return m.source === "ingredients" && m.matchedText ? `${label} — "${m.matchedText}"` : label;
}
