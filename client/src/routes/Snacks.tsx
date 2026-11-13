import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { useScanningFor } from "../TabShell";
import { historyRowLabel, shopperCount } from "../lib/allergenRowCopy";
import { getSnackList, removeSnack, updateSnackNote, type ProfileSummary, type SnackItem, type SnackList } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { changedByLine, circleReportLine } from "../lib/correctionCopy";
import { JUDGE_LINK_NOT_FOUND } from "../lib/judgeLink";
import { addProfileHref } from "../lib/profileSections";
import {
  ADD_NOTE,
  AFFILIATE_DISCLOSURE,
  approvedBy,
  EDIT_NOTE,
  EMPTY_SCAN_LINK,
  emptyLine,
  LABEL_WRONG,
  LIST_FAILED,
  listTitle,
  NO_PROFILE,
  NOTE_CANCEL,
  NOTE_LABEL,
  NOTE_MAX,
  NOTE_SAVE,
  notCheckedLine,
  REMOVE,
  SCAN_WHEN_IT_ARRIVES,
  SHOP_AMAZON,
  SHOP_INSTACART,
  shortDate,
  snackReportPath,
} from "../lib/snackListCopy";
import { scanningForId } from "../lib/tabs";
import { DISCLAIMER, DISCLAIMER_SHORT, EMERGENCY, VERDICT_LABEL } from "../lib/verdictCopy";

/**
 * The Snacks tab (docs/snack-list-plan.md, 2026-11-13; behind SNACK_LIST): the chosen profile's list,
 * in the order the server sends it (flagged items first), each item with its verdict as it is now —
 * computed from stored data, no AI call — in the verdict card's own words, who approved it and when,
 * the note, and the shop links only when the response carries them (never for a "Contains" item,
 * which offers the correction flow instead). The profile is the shell's chosen one, the same value
 * as Scan's pill, so moving between Scan and Snacks keeps the same child.
 */
export function Snacks() {
  const { snackListEnabled, loading } = useAuth();
  const { chosenProfileId, profiles, profilesLoaded } = useScanningFor();
  const profile = profiles.find((p) => p.id === scanningForId(chosenProfileId, profiles)) ?? null;
  const [list, setList] = useState<SnackList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reads, setReads] = useState(0);

  useEffect(() => {
    if (!profile || !snackListEnabled) return;
    let live = true;
    setError(null);
    getSnackList(profile.id)
      .then((l) => live && setList(l))
      .catch(() => {
        if (!live) return;
        setList(null);
        setError(LIST_FAILED);
      });
    return () => {
      live = false;
    };
  }, [profile?.id, reads, snackListEnabled]);

  // Off, the route still exists; it reads as a page that isn't there, like the server's 404.
  if (!loading && !snackListEnabled) {
    return (
      <main>
        <h1>{JUDGE_LINK_NOT_FOUND}</h1>
      </main>
    );
  }

  if (profilesLoaded && !profile) {
    return (
      <main className="snacks">
        <h1>Snacks</h1>
        <p>
          {NO_PROFILE} <Link to={addProfileHref(true)}>Add a profile</Link>
        </p>
      </main>
    );
  }
  if (!profile) return <main className="snacks" />;

  const canManage = profile.relationship === "owner" || profile.relationship === "co_manager";
  const refresh = () => setReads((n) => n + 1);

  return (
    <main className="snacks">
      <h1>{listTitle(profile)}</h1>
      {/* In full once for the whole list; each item also carries the short line, as scan history does. */}
      <div role="note" className="verdict-card__disclaimer scan-history__disclaimer">
        <p>{DISCLAIMER}</p>
        <p>
          <strong>{EMERGENCY}</strong>
        </p>
      </div>

      {error && <p role="alert">{error}</p>}

      {list && list.items.length === 0 && (
        <p className="snacks__empty">
          {emptyLine(profile, canManage)}{" "}
          {canManage && <Link to={`/scan?profile=${encodeURIComponent(profile.id)}`}>{EMPTY_SCAN_LINK}</Link>}
        </p>
      )}

      {list && list.items.length > 0 && (
        <ul className="card-list snacks__list">
          {list.items.map((item) => (
            <SnackItemCard
              key={item.id}
              item={item}
              profile={profile}
              canManage={canManage}
              onRemove={async () => {
                await removeSnack(profile.id, item.id);
                refresh();
              }}
              onSaveNote={async (note) => {
                await updateSnackNote(profile.id, item.id, note);
                refresh();
              }}
            />
          ))}
        </ul>
      )}

      {list?.affiliate && <p className="card__meta snacks__affiliate">{AFFILIATE_DISCLOSURE}</p>}
    </main>
  );
}

/**
 * One item. The verdict first, in the card's colour and with its icon (styles.css [data-verdict]),
 * then the product, who approved it, the allergen rows that claim anything, what changed the verdict,
 * the note, the "scan it when it arrives" line, the shop links when sent, the correction link on a
 * Contains item, and the manager's controls. Never the word "safe" (lib/verdictCopy.ts).
 */
export function SnackItemCard({
  item,
  profile,
  canManage,
  onRemove,
  onSaveNote,
}: {
  item: SnackItem;
  profile: Pick<ProfileSummary, "id" | "label" | "is_self">;
  canManage: boolean;
  onRemove: () => Promise<void>;
  onSaveNote: (note: string | null) => Promise<void>;
}) {
  const shown = item.effective ?? item.original;
  const rows = shown.matched_allergens.filter((m) => m.classification !== "clear" && m.classification !== "unchecked");
  const unchecked = shown.matched_allergens.filter((m) => m.classification === "unchecked").map((m) => m.allergenName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.note ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    setFailed(null);
    try {
      await action();
      setEditing(false);
    } catch {
      setFailed(failure);
    } finally {
      setBusy(false);
    }
  }

  function saveNote(e: FormEvent) {
    e.preventDefault();
    const note = draft.trim();
    void run(() => onSaveNote(note === "" ? null : note), "Couldn't save the note. Try again.");
  }

  return (
    <li className="card snack-item" data-verdict={item.headline}>
      <p className="verdict-card__headline snack-item__verdict">{VERDICT_LABEL[item.headline]}</p>
      <p className="snack-item__product">
        <strong>{item.product.name ?? "Unknown product"}</strong>
        {item.product.brand && <span className="snack-item__brand"> — {item.product.brand}</span>}
        <span className="card__meta card__line snack-item__barcode">{item.barcode}</span>
      </p>
      <p className="card__meta snack-item__approved">{approvedBy(item.added_by, shortDate(item.created_at))}</p>

      {rows.length > 0 && (
        <ul className="history-entry__rows">
          {rows.map((m) => (
            <li key={m.allergenName}>
              {m.allergenName} ({m.severity}) — {historyRowLabel(m)}
            </li>
          ))}
        </ul>
      )}
      {unchecked.length > 0 && <p role="note">{notCheckedLine(unchecked)}</p>}

      {item.effective && (
        <div role="note" className="snack-item__changed">
          <p>
            The product data alone says <strong>{VERDICT_LABEL[item.original.result]}</strong>.{" "}
            {changedByLine({ yours: false, shoppers: item.community_reports.length > 0, circle: item.pending_circle_reports.length > 0 })}
          </p>
          <ul>
            {item.community_reports.map((r) => (
              <li key={r.allergenName}>
                {r.allergenName} — reported present by {shopperCount(r.reporterCount)}
              </li>
            ))}
            {item.pending_circle_reports.map((r) => (
              <li key={`circle-${r.allergenName}`} className="circle-report">
                {circleReportLine(r, profile.label)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing ? (
        <form className="snack-item__note-form" onSubmit={saveNote}>
          <label>
            {NOTE_LABEL}
            <input type="text" value={draft} maxLength={NOTE_MAX} onChange={(e) => setDraft(e.target.value)} />
          </label>
          <p className="snack-item__actions">
            <button type="submit" className="button-primary" disabled={busy}>
              {busy ? "Saving…" : NOTE_SAVE}
            </button>
            <button type="button" disabled={busy} onClick={() => setEditing(false)}>
              {NOTE_CANCEL}
            </button>
          </p>
        </form>
      ) : (
        item.note && <p className="snack-item__note">{item.note}</p>
      )}

      <p className="card__meta snack-item__arrives">{SCAN_WHEN_IT_ARRIVES}</p>

      {item.shop && (
        <p className="snack-item__shop">
          <a className="button-link" href={item.shop.amazon} target="_blank" rel="noopener noreferrer">
            {SHOP_AMAZON}
          </a>
          <a className="button-link" href={item.shop.instacart} target="_blank" rel="noopener noreferrer">
            {SHOP_INSTACART}
          </a>
        </p>
      )}

      {item.headline === "contains_allergen" && (
        <p className="snack-item__report">
          <Link to={snackReportPath(profile.id, item.id)}>{LABEL_WRONG}</Link>
        </p>
      )}

      {failed && <p role="alert">{failed}</p>}

      {canManage && !editing && (
        <p className="snack-item__actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft(item.note ?? "");
              setEditing(true);
            }}
          >
            {item.note ? EDIT_NOTE : ADD_NOTE}
          </button>
          <button type="button" disabled={busy} onClick={() => void run(onRemove, "Couldn't remove it. Try again.")}>
            {REMOVE}
          </button>
        </p>
      )}

      <p className="history-entry__disclaimer">{DISCLAIMER_SHORT}</p>
    </li>
  );
}
