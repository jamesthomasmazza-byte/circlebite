import { getProfileAccess } from "../authorization/profiles.js";
import { pool } from "../db/pool.js";
import { env } from "../env.js";
import type { ProfileAllergen } from "../matcher/match.js";
import { escalateProfileAllergens } from "./applyCommunityCorrections.js";
import type { EffectiveScanResult, ScanForCorrection } from "./applyCorrections.js";

/**
 * A pending escalation shared inside the circle it came from (JT, 2026-10-13; Prof. Yoest approved
 * the direction 2026-10-14). Before this, a pending report changed only its reporter's view of the
 * one scan they filed it from (userScanView.ts), so a grandparent who reported peanut was invisible
 * to the child's parent until a second family corroborated it.
 *
 * Now a pending add_caution reaches everyone who can read the profile it was filed from, on every
 * scan of that barcode. Only that profile — not a sibling's with the same owner (JT, 2026-10-16):
 * before a second family confirms it, a report is one person's unverified observation about the
 * package for one child. Only additions: a pending removal still changes nothing but its reporter's
 * own view, on the scan they filed it from. Warnings spread easily inside a family; clearings don't
 * (docs/principles.md principle 1).
 *
 * Only status = 'pending'. A corroborated report already reaches this profile as a community
 * addition (communityAdditions.ts), and that layer runs first, so the card says "confirmed by N
 * families" rather than "one report". A rejected one stops being shared: an admin looked at the
 * photo and said no. Its reporter still sees it (applyUserCorrections — a rejection never lifts a
 * warning someone attested to from the package in their own hand), but it's no longer put in front
 * of the rest of the circle as a report waiting on a second family, because it isn't one.
 *
 * Who reported it: by name and role to the profile's owner and co-managers, by role only to a
 * follower (JT, 2026-10-27, on Prof. Yoest's question of that day). A follower is never shown who
 * else is in the circle — the circle summary and change history 404 them — and this was the one
 * place it showed. Withheld here, where every card and history entry loads it, so a follower's
 * browser never receives another member's name. Their own report is still theirs ("You").
 */

export type CircleReporter = {
  /** Display name now. Null when the reporter deleted their account, or when it's withheld. Never
   *  an email address (R9). */
  name: string | null;
  /** Their role on this profile now. Null when they're no longer in its circle. */
  role: "owner" | "co_manager" | "follower" | null;
  isViewer: boolean;
  /** True when the viewer is a follower and this is someone else's report: role only, no name. */
  withheld: boolean;
};

export type CircleEscalation = {
  /** As the reporter spelled it — one of this profile's own allergen names, from the report form. */
  allergen: string;
  correctionId: string;
  /** Server-side only, for counting people — never sent to the client. Null for a deleted account. */
  reporterId: string | null;
  reporter: CircleReporter;
};

export type AppliedCircleEscalation = {
  allergenName: string;
  reporters: CircleReporter[];
};

export type CircleEffectiveResult = EffectiveScanResult & { applied: AppliedCircleEscalation[] };

type ScanKey = { id: string | null; barcode: string | null };

/**
 * This profile's pending escalations for each scan, in the same order as `scans`. A scan with a barcode gets
 * every one filed on that barcode from this profile, whichever scan it was filed from — that's what
 * lets a report outlive the scan it came from. A barcode-less scan (Path C) gets only the ones filed
 * from that scan: with no barcode there is no product identity to carry a report to another scan
 * (the reasoning recordCorrection.ts gives for never corroborating them).
 *
 * `id` null is a scan not written yet — the live card computes its view before the insert — which
 * can only match by barcode.
 */
export async function loadCircleEscalations(
  profileId: string,
  scans: ScanKey[],
  viewerId: string,
): Promise<CircleEscalation[][]> {
  if (scans.length === 0) return [];

  const barcodes = [...new Set(scans.map((s) => s.barcode).filter((b): b is string => b !== null))];
  const scanIds = scans.map((s) => s.id).filter((id): id is string => id !== null);

  // Names only for the people who manage the profile. Anyone else — a follower, or an access this
  // didn't expect — gets roles: withholding is the side to fail on.
  const access = await getProfileAccess(viewerId, profileId);
  const seesNames = access?.level === "owner" || access?.level === "co_manager";

  // Role is read now, not at report time: the card tells today's circle who is behind a warning
  // they're being shown, and someone who has since left it is said to have left.
  const { rows } = await pool.query<{
    id: string;
    scan_id: string | null;
    barcode: string | null;
    allergen: string;
    reported_by: string | null;
    name: string | null;
    role: CircleReporter["role"];
  }>(
    `SELECT c.id, c.scan_id, c.barcode, c.allergen, c.reported_by, u.display_name AS name,
            CASE
              WHEN c.reported_by IS NULL THEN NULL
              WHEN p.manager_id = c.reported_by THEN 'owner'
              WHEN EXISTS (SELECT 1 FROM profile_managers m
                            WHERE m.allergen_profile_id = p.id AND m.user_id = c.reported_by) THEN 'co_manager'
              WHEN EXISTS (SELECT 1 FROM follow_relationships f
                            WHERE f.allergen_profile_id = p.id AND f.follower_id = c.reported_by
                              AND f.status = 'accepted') THEN 'follower'
            END AS role
     FROM product_corrections c
     JOIN allergen_profiles p ON p.id = c.allergen_profile_id_at_report
     LEFT JOIN users u ON u.id = c.reported_by
     WHERE c.allergen_profile_id_at_report = $1
       AND c.status = 'pending'
       AND c.direction = 'add_caution'
       AND c.allergen IS NOT NULL
       AND (c.barcode = ANY($2) OR c.scan_id = ANY($3))
     ORDER BY c.created_at ASC, c.id`,
    [profileId, barcodes, scanIds],
  );

  return scans.map((scan) =>
    rows
      .filter((r) => (scan.barcode !== null ? r.barcode === scan.barcode : scan.id !== null && r.scan_id === scan.id))
      .map((r) => ({
        allergen: r.allergen,
        correctionId: r.id,
        reporterId: r.reported_by,
        reporter: circleReporter(r, viewerId, seesNames),
      })),
  );
}

function circleReporter(
  r: { reported_by: string | null; name: string | null; role: CircleReporter["role"] },
  viewerId: string,
  seesNames: boolean,
): CircleReporter {
  const isViewer = r.reported_by !== null && r.reported_by === viewerId;
  // A deleted account has no name to withhold; the card says it was deleted, to everyone.
  if (isViewer || seesNames || r.reported_by === null) return { name: r.name, role: r.role, isViewer, withheld: false };
  return { name: null, role: r.role, isViewer: false, withheld: true };
}

/**
 * Escalates this profile's view for its circle's pending reports — escalate-only, through the same
 * step as community additions. Each escalated entry is marked `circleReported`, so the card can say
 * the warning rests on one family's report and nothing more.
 */
export function applyCircleEscalations(
  scan: ScanForCorrection,
  profileAllergens: Pick<ProfileAllergen, "name" | "severity">[],
  escalations: CircleEscalation[],
): CircleEffectiveResult | null {
  const escalation = escalateProfileAllergens(scan, profileAllergens, escalations, () => ({ circleReported: true }));
  if (!escalation) return null;
  return {
    result: escalation.result,
    matchedAllergens: escalation.matchedAllergens,
    applied: escalation.escalated.map(({ allergenName, relevant }) => ({
      allergenName,
      // One entry per person: "Peanut" and "Peanuts" from the same grandparent are one reporter.
      reporters: dedupeReporters(relevant),
    })),
  };
}

// By account, not by name: two people in one circle can share a display name. A deleted account
// has no id left, so each of its reports counts as its own reporter — never merged into someone else.
function dedupeReporters(escalations: CircleEscalation[]): CircleReporter[] {
  const seen = new Set<string>();
  return escalations
    .filter((e) => {
      const key = e.reporterId ?? `deleted:${e.correctionId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((e) => e.reporter);
}

/** What the client gets: which of this profile's allergens one circle report raised, and who. */
export function publicCircleReports(applied: AppliedCircleEscalation[]) {
  return applied.map(({ allergenName, reporters }) => ({ allergenName, reporters }));
}

/**
 * The live-card wrapper: load and apply for one scan when the switch is on. `scanId` is null for a
 * scan that hasn't been written yet. Returns null when the switch is off or nothing applied.
 */
export async function applyCircleEscalationsIfEnabled(
  target: { profileId: string; scanId: string | null; barcode: string | null; viewerId: string },
  scan: ScanForCorrection,
  profileAllergens: Pick<ProfileAllergen, "name" | "severity">[],
): Promise<CircleEffectiveResult | null> {
  if (!env.circleEscalations) return null;
  if (target.barcode === null && target.scanId === null) return null;
  const [escalations] = await loadCircleEscalations(
    target.profileId,
    [{ id: target.scanId, barcode: target.barcode }],
    target.viewerId,
  );
  return applyCircleEscalations(scan, profileAllergens, escalations);
}
