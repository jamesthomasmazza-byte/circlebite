import { pool } from "../db/pool.js";

/** The newest this many entries — a profile's history is small, but a response is never unbounded. */
export const HISTORY_ENTRY_LIMIT = 200;

export type AllergenImage = {
  name: string;
  severity: string;
  notes: string | null;
  treat_traces_as_unsafe: boolean;
};

export type ProfileImage = {
  label: string;
  notes: string | null;
  default_treat_traces_as_unsafe: boolean;
};

export type ProfileHistoryEntry = {
  id: string;
  kind: "allergen_added" | "allergen_edited" | "allergen_removed" | "profile_edited" | "downgrade_reported";
  createdAt: Date;
  /** Display name at the time. Null when no one in the app made it (actorKnown false), or the
   *  actor id named no user. Never an email address (R9). */
  actorName: string | null;
  actorRole: "owner" | "co_manager" | null;
  /** False when the change was made outside the app — no acting user was recorded. */
  actorKnown: boolean;
  actorIsViewer: boolean;
  before: AllergenImage | ProfileImage | null;
  after: AllergenImage | ProfileImage | null;
  /** Set for downgrade_reported only. */
  downgrade: {
    /** As recorded. Null only if the snapshot is missing — the copy then says a problem was
     *  reported without claiming which kind, never a guess. */
    correctionType: "flag_wrong" | "wrong_product" | null;
    allergen: string | null;
    productName: string | null;
    productBrand: string | null;
    verdictAtReport: string | null;
    note: string | null;
    hasPhoto: boolean;
    scannedAt: Date | null;
    /** The report's status now, read live — null if the report row no longer exists. */
    currentStatus: "pending" | "corroborated" | "rejected" | null;
  } | null;
  /** True only for the owner, on an entry someone else made that they haven't acknowledged. */
  unseen: boolean;
};

type Row = {
  id: string;
  kind: ProfileHistoryEntry["kind"];
  created_at: Date;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: ProfileHistoryEntry["actorRole"];
  before: ProfileHistoryEntry["before"];
  after: ProfileHistoryEntry["after"];
  correction_type: "flag_wrong" | "wrong_product" | null;
  allergen: string | null;
  product_name: string | null;
  product_brand: string | null;
  verdict_at_report: string | null;
  note: string | null;
  photo_path: string | null;
  scan_created_at: Date | null;
  current_status: "pending" | "corroborated" | "rejected" | null;
  unseen: boolean;
};

/**
 * A profile's change history, newest first, as the viewer (an owner or co-manager — the caller
 * authorizes) should read it. The raw before/after go to the client unchanged; the sentence a
 * parent reads is rendered from them there (client/src/lib/profileChangeCopy.ts), never stored.
 */
export async function loadProfileHistory(profileId: string, viewerId: string): Promise<ProfileHistoryEntry[]> {
  const { rows } = await pool.query<Row>(
    `SELECT c.id, c.kind, c.created_at, c.actor_id, c.actor_name, c.actor_role, c.before, c.after,
            c.correction_type, c.allergen, c.product_name, c.product_brand, c.verdict_at_report, c.note,
            c.photo_path, c.scan_created_at,
            pc.status AS current_status,
            (p.manager_id = $2
              AND c.actor_id IS DISTINCT FROM $2
              AND NOT EXISTS (SELECT 1 FROM profile_change_acks a WHERE a.change_id = c.id AND a.user_id = $2)
            ) AS unseen
     FROM profile_changes c
     JOIN allergen_profiles p ON p.id = c.allergen_profile_id
     LEFT JOIN product_corrections pc ON pc.id = c.correction_id
     WHERE c.allergen_profile_id = $1
     ORDER BY c.created_at DESC, c.seq DESC
     LIMIT $3`,
    [profileId, viewerId, HISTORY_ENTRY_LIMIT],
  );

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    createdAt: r.created_at,
    actorName: r.actor_name,
    actorRole: r.actor_role,
    actorKnown: r.actor_id !== null,
    actorIsViewer: r.actor_id === viewerId,
    before: r.before,
    after: r.after,
    downgrade:
      r.kind === "downgrade_reported"
        ? {
            correctionType: r.correction_type,
            allergen: r.allergen,
            productName: r.product_name,
            productBrand: r.product_brand,
            verdictAtReport: r.verdict_at_report,
            note: r.note,
            hasPhoto: r.photo_path !== null,
            scannedAt: r.scan_created_at,
            currentStatus: r.current_status,
          }
        : null,
    unseen: r.unseen,
  }));
}

/** The snapshotted evidence photo for one downgrade entry on this profile, or null. */
export async function loadChangePhotoPath(profileId: string, changeId: string): Promise<string | null> {
  const { rows } = await pool.query<{ photo_path: string | null }>(
    "SELECT photo_path FROM profile_changes WHERE id = $1 AND allergen_profile_id = $2",
    [changeId, profileId],
  );
  return rows[0]?.photo_path ?? null;
}
