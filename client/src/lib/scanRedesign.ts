import type { ProfileSummary, ScanHistoryEntry } from "./api";
import { allergenLine } from "./profileLineCopy";
import { VERDICT_LABEL } from "./verdictCopy";

// The redesigned Scan tab (JT's mockup, 2026-11-06, behind SCAN_REDESIGN). A layout only: the
// verdict, its labels and its wording all come from the copy Scan already uses (verdictCopy.ts,
// allergenRowCopy.ts, correctionCopy.ts, evidenceCopy.ts). Plain values, under test. What's here is
// only what the new layout itself adds, each checked against the code (Nov 6):
//  - the camera decodes on its own once it's running, with no shutter (BarcodeScanner.tsx); it
//    still starts on a tap, with the first-use sentence before it, as today;
//  - an unreadable or incomplete label photo gets no verdict, and the app asks for another
//    (server verdict/labelScan.ts and combineScan.ts, legible/complete);
//  - the product record's "may contain" list comes from the record itself (lib/recordMayContain.ts).

/** Whether the shell shows Scan's own pill in place of the one-line header: on Scan, with the switch. */
export function scanStageOn(enabled: boolean, onScan: boolean): boolean {
  return enabled && onScan;
}

/** The pill's circle: the profile's first letter. */
export function profileInitial(label: string): string {
  return [...label.trim()][0]?.toUpperCase() ?? "?";
}

/**
 * The chips under the pill: the profile line's own rules exactly (profileLineCopy.ts, Oct 25).
 * Names only, never severity or notes; a severe-only follower is sent only the severe names; three
 * names, then how many more; and an empty list says what the profile line says — for a severe-only
 * follower "Only severe allergens are shared with you", never "no allergens".
 */
export function allergenChips(p: Pick<ProfileSummary, "allergen_names" | "share_level">): {
  names: string[];
  more: number;
  empty: string | null;
} {
  if (p.allergen_names.length === 0) return { names: [], more: 0, empty: allergenLine(p) };
  return { names: p.allergen_names.slice(0, 3), more: Math.max(0, p.allergen_names.length - 3), empty: null };
}

/** Under the barcode frame, while the camera is running — never before, when it still needs a tap.
 *  Alone since 2026-11-06: "It scans on its own. No button needed." overlapped Recent on an iPhone. */
export const POINT_AT_BARCODE = "Point at the barcode";
export const FLASH_ON = "Turn flash on";
export const FLASH_OFF = "Turn flash off";

export type ScanMode = "barcode" | "photo" | "type";

/** The segmented control. "Label photo" only with LABEL_SCAN: there'd be no photo flow to open. */
export function scanModes(labelScanEnabled: boolean): { mode: ScanMode; label: string }[] {
  return [
    { mode: "barcode", label: "Barcode" },
    ...(labelScanEnabled ? [{ mode: "photo" as const, label: "Label photo" }] : []),
    { mode: "type", label: "Type it" },
  ];
}

export type RecentCard = { id: string; label: string; productName: string; href: string };

/**
 * "Recent for <name>": the profile's last three scans, newest first, as its history has them. The
 * label is the verdict the history card headlines — the corrected view when a report changed it —
 * in the app's exact words. Each links to that scan on the profile's history page.
 */
export function recentCards(profileId: string, history: ScanHistoryEntry[]): RecentCard[] {
  return history.slice(0, 3).map((s) => ({
    id: s.id,
    label: VERDICT_LABEL[(s.effective ?? s.original).result],
    productName: s.product_name ?? "Unknown product",
    href: `/profiles/${profileId}/history#scan-${s.id}`,
  }));
}

export function recentHeading(label: string): string {
  return `Recent for ${label}`;
}

/** "en:sesame-seeds" → "sesame seeds": Open Food Facts' tag, as words. */
export function traceName(tag: string): string {
  return tag.replace(/^[a-z]{2,3}:/, "").replace(/-/g, " ");
}

/**
 * The line under the rows about the product record's own "may contain" list. Nothing when there's
 * no record to speak for (not on file, or the lookup failed, or a photo result): the card already
 * says why. "None" is a claim about the record only, and it says to check the package.
 */
export function mayContainLine(tags: string[] | null | undefined): string | null {
  if (!tags) return null;
  if (tags.length === 0) return "None on the product record. Check the package.";
  return `May contain, on the product record: ${tags.map(traceName).join(", ")}.`;
}

export function forLabel(label: string): string {
  return `For ${label}`;
}

// ---- The label photo screen ----

export const LABEL_CHECKLIST = [
  "Every line of the ingredients",
  "The “Contains” and “May contain” lines",
  "No glare",
];
export const LABEL_PROMISE = "If any part is cut off or hard to read, we'll ask for another photo instead of guessing.";
export const TAKE_PHOTO = "Take photo";
export const CHOOSE_PHOTO = "Choose from photos";

// ---- The result sheet ----

type Named = { allergenName: string };
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A pending circle report shown on its own allergen's row, in the full sentence today's card puts
 * under the rows (correctionCopy.ts circleReportLine: the reporter by name to the owner and
 * co-managers, by role to a follower, as the server sends it). The list under the rows keeps every
 * report as today: "Changed because of:" needs its items, and an empty list there read as missing.
 */
export function circleReportsOnRow<R extends Named>(reports: R[], rowName: string): R[] {
  return reports.filter((r) => sameName(r.allergenName, rowName));
}

