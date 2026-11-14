import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ProductPhoto } from "../ProductPhoto";
import { useScanningFor } from "../TabShell";
import { shopperCount } from "../lib/allergenRowCopy";
import { ApiRequestError, getSnackList, linkSnackOnAmazon, removeSnack, updateSnackNote, type ProfileSummary, type SnackItem, type SnackList } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { changedByLine, circleReportLine } from "../lib/correctionCopy";
import { JUDGE_LINK_NOT_FOUND } from "../lib/judgeLink";
import {
  ADD_NOTE,
  amazonLinkedBy,
  CHANGE_AMAZON_LINK,
  CHECKED_FOR,
  checkedRowLabel,
  DETAIL_ARRIVES,
  EDIT_NOTE,
  ITEM_GONE,
  LABEL_WRONG,
  LINK_AMAZON,
  LINK_AMAZON_HINT,
  LINK_AMAZON_LABEL,
  LINK_FAILED,
  LINK_SAVE,
  linkRefusedLine,
  LIST_FAILED,
  listTitle,
  NOTE_CANCEL,
  NOTE_LABEL,
  NOTE_MAX,
  NOTE_SAVE,
  REMOVE_FROM_LIST,
  REMOVE_LINK,
  SHOP_AMAZON,
  SHOP_INSTACART,
  shortDate,
  snackReportPath,
  snacksPath,
  UNKNOWN_PRODUCT,
} from "../lib/snackListCopy";
import { scanningForId } from "../lib/tabs";
import { VERDICT_LABEL } from "../lib/verdictCopy";

/**
 * One item's page (JT's mockup, Nov 14; /snacks/:itemId, behind SNACK_LIST): read from the same list
 * call as the Snacks tab, so the access rules and the verdict are exactly the list's. A back link, the
 * large photo, name, brand and barcode, the full verdict block (the headline and every allergen that
 * was checked), the note, the "scan it when it arrives" line, then the actions — which the list no
 * longer carries. A "Contains" item has no shop or link actions and offers the correction flow; a
 * follower reads; a no-allergen profile's item has no verdict block. Never the word "safe".
 */
export function SnackDetail() {
  const { itemId = "" } = useParams();
  const { snackListEnabled, snackCartsEnabled, loading } = useAuth();
  const { chosenProfileId, profiles, profilesLoaded } = useScanningFor();
  const profile = profiles.find((p) => p.id === scanningForId(chosenProfileId, profiles)) ?? null;
  const navigate = useNavigate();
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

  if (!loading && !snackListEnabled) {
    return (
      <main>
        <h1>{JUDGE_LINK_NOT_FOUND}</h1>
      </main>
    );
  }
  if (!profile) {
    return (
      <main className="snack-detail">
        {profilesLoaded && (
          <p>
            <Link to={snacksPath("")}>Snacks</Link>
          </p>
        )}
      </main>
    );
  }

  const item = list?.items.find((i) => i.id === itemId) ?? null;
  const canManage = profile.relationship === "owner" || profile.relationship === "co_manager";
  const plain = list !== null && list.allergen_count === 0;

  return (
    <main className="snack-detail">
      <p className="snack-detail__back">
        <Link to={snacksPath(profile.id)}>← {listTitle(profile)}</Link>
      </p>
      {error && <p role="alert">{error}</p>}
      {list && !item && <p role="status">{ITEM_GONE}</p>}
      {item && (
        <SnackDetailView
          item={item}
          profile={profile}
          plain={plain}
          canManage={canManage}
          cartsEnabled={snackCartsEnabled}
          onSaveNote={async (note) => {
            await updateSnackNote(profile.id, item.id, note);
            setReads((n) => n + 1);
          }}
          onLinkAmazon={async (url) => {
            await linkSnackOnAmazon(profile.id, item.id, url);
            setReads((n) => n + 1);
          }}
          onRemove={async () => {
            await removeSnack(profile.id, item.id);
            navigate(snacksPath(profile.id), { replace: true });
          }}
        />
      )}
    </main>
  );
}

/** The page's body, with the item in hand, so it renders under test. */
export function SnackDetailView({
  item,
  profile,
  plain = false,
  canManage,
  cartsEnabled = false,
  onSaveNote,
  onLinkAmazon,
  onRemove,
}: {
  item: SnackItem;
  profile: Pick<ProfileSummary, "id" | "label" | "is_self">;
  plain?: boolean;
  canManage: boolean;
  cartsEnabled?: boolean;
  onSaveNote: (note: string | null) => Promise<void>;
  onLinkAmazon: (url: string | null) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const shown = item.effective ?? item.original;
  const contains = item.headline === "contains_allergen";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.note ?? "");
  const [linking, setLinking] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    setFailed(null);
    try {
      await action();
      setEditing(false);
      setLinking(false);
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

  function openLinkForm() {
    setLinkDraft("");
    setLinkError(null);
    setLinking(true);
  }

  async function saveLink(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLinkError(null);
    try {
      await onLinkAmazon(linkDraft.trim());
      setLinking(false);
      setLinkDraft("");
    } catch (err) {
      setLinkError(err instanceof ApiRequestError && err.message === "invalid_amazon_link" ? linkRefusedLine(linkDraft) : LINK_FAILED);
    } finally {
      setBusy(false);
    }
  }

  const canLink = cartsEnabled && canManage && Boolean(item.shop);

  return (
    <article className="snack-detail__item" data-verdict={plain ? undefined : item.headline}>
      <ProductPhoto src={item.product.image ?? item.product.image_small} size="detail" />
      <h1 className="snack-detail__name">{item.product.name ?? UNKNOWN_PRODUCT}</h1>
      <p className="snack-detail__product card__meta">
        {item.product.brand && <span className="card__line">{item.product.brand}</span>}
        <span className="card__line">{item.barcode}</span>
      </p>

      {!plain && (
        <section className="snack-detail__verdict" aria-label="Verdict">
          <p className="verdict-card__headline">{VERDICT_LABEL[item.headline]}</p>
          {shown.matched_allergens.length > 0 && (
            <>
              <p className="snack-detail__checked card__meta">{CHECKED_FOR}</p>
              <ul className="history-entry__rows">
                {shown.matched_allergens.map((m) => (
                  <li key={m.allergenName}>
                    {m.allergenName} ({m.severity}) — {checkedRowLabel(m)}
                  </li>
                ))}
              </ul>
            </>
          )}
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
        </section>
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

      <p className="card__meta snack-detail__arrives">{DETAIL_ARRIVES}</p>

      {cartsEnabled && item.amazon && <p className="card__meta snack-item__amazon">{amazonLinkedBy(item.amazon.linked_by, shortDate(item.amazon.linked_at))}</p>}

      {linking && (
        <form className="snack-item__note-form snack-item__link-form" onSubmit={(e) => void saveLink(e)}>
          <label>
            {LINK_AMAZON_LABEL}
            <input type="url" inputMode="url" autoComplete="off" value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} required />
          </label>
          <p className="card__meta">{LINK_AMAZON_HINT}</p>
          {linkError && <p role="alert">{linkError}</p>}
          <p className="snack-item__actions">
            <button type="submit" className="button-primary" disabled={busy}>
              {busy ? "Saving…" : LINK_SAVE}
            </button>
            <button type="button" disabled={busy} onClick={() => setLinking(false)}>
              {NOTE_CANCEL}
            </button>
            {item.amazon && (
              <button type="button" disabled={busy} onClick={() => void run(() => onLinkAmazon(null), LINK_FAILED)}>
                {REMOVE_LINK}
              </button>
            )}
          </p>
        </form>
      )}

      {failed && <p role="alert">{failed}</p>}

      {/* The actions. Shop first: a manager's unlinked item has "Link on Amazon" — the search in a new
          tab and the paste box here — else "Shop on Amazon" to the product when linked, the search
          when not. A "Contains" item has no shop links (the server omits them) and offers the
          correction flow instead. */}
      <div className="snack-detail__actions">
        {item.shop &&
          (canLink && !item.amazon ? (
            <a className="button-link button-link--primary" href={item.shop.amazon} target="_blank" rel="noopener noreferrer" onClick={openLinkForm}>
              {LINK_AMAZON}
            </a>
          ) : (
            <a className="button-link button-link--primary" href={item.shop.amazon} target="_blank" rel="noopener noreferrer">
              {SHOP_AMAZON}
            </a>
          ))}
        {item.shop && (
          <a className="button-link" href={item.shop.instacart} target="_blank" rel="noopener noreferrer">
            {SHOP_INSTACART}
          </a>
        )}
        {contains && (
          <p className="snack-item__report">
            <Link to={snackReportPath(profile.id, item.id)}>{LABEL_WRONG}</Link>
          </p>
        )}
        {canManage && !editing && !linking && (
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
            {canLink && item.amazon && (
              <button type="button" className="link-button" disabled={busy} onClick={openLinkForm}>
                {CHANGE_AMAZON_LINK}
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void run(onRemove, "Couldn't remove it. Try again.")}>
              {REMOVE_FROM_LIST}
            </button>
          </p>
        )}
      </div>
    </article>
  );
}
