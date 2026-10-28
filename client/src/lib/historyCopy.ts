import type { ScanHistoryEntry } from "./api";
import { REVIEWED_NOT_ACCEPTED, UNCHANGED_BY_YOUR_REPORT, yourReportsChangedCard } from "./correctionCopy";

// Scan history's one-line summary per entry (2026-10-28 audit; BACKLOG.md Week 9, "Scan history
// repeats itself"). The reasoning moves into a disclosure; what stays outside it is the verdict, what
// changed it, and every uncertainty — principle 2: uncertainty is shown, never folded away. So an
// allergen that wasn't checked is named here, and a circle report says "not yet confirmed" here;
// only the explanation of each goes in the disclosure. No reporter is ever named in a summary:
// followers see roles only (server circleEscalations.ts), and a summary has room for neither.

/** A changed verdict whose report this viewer's share level hides. Said in the same words the
 *  history list already used for it, so the summary reveals nothing more: not which allergen, not
 *  that a milder one exists beyond what this sentence already said (routes/scansHistory.test.ts). */
export const REPORT_NOT_SHARED = "A report about an allergen on this profile that isn't shared with you";

type Entry = Pick<ScanHistoryEntry, "original" | "effective" | "corrections" | "community_reports" | "pending_circle_reports">;

/** What changed this entry's verdict, in one line, or null when nothing did. */
export function historyChangedLine(scan: Entry): string | null {
  if (!scan.effective) {
    // Only rejected reports left: the engine's own verdict again (ScanHistory.tsx).
    return scan.corrections.length > 0 ? `Your report was ${REVIEWED_NOT_ACCEPTED}, so this is the original verdict.` : null;
  }
  const yours = yourReportsChangedCard(scan.corrections);
  const shoppers = scan.community_reports.length > 0;
  const circle = scan.pending_circle_reports.length > 0;
  if (!yours && !shoppers && !circle) {
    if (scan.corrections.length > 0) return `${UNCHANGED_BY_YOUR_REPORT.replace(/:$/, "")}.`;
    return `Changed by ${REPORT_NOT_SHARED.charAt(0).toLowerCase()}${REPORT_NOT_SHARED.slice(1)}.`;
  }
  const named = [
    yours && "your report",
    shoppers && "shopper reports",
    circle && "a report from your circle, not yet confirmed",
  ].filter((s): s is string => Boolean(s));
  const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return `Changed by ${list}.`;
}

/** "Not checked: sesame, milk." — every allergen this entry couldn't check, by name, or null. */
export function historyNotCheckedLine(scan: Entry): string | null {
  const shown = scan.effective ?? scan.original;
  const names = shown.matched_allergens.filter((m) => m.classification === "unchecked").map((m) => m.allergenName.toLowerCase());
  return names.length > 0 ? `Not checked: ${names.join(", ")}.` : null;
}
