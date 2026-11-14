import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { SnackSearch } from "../SnackSearch";
import { useScanningFor } from "../TabShell";
import { historyRowLabel, shopperCount } from "../lib/allergenRowCopy";
import {
  ApiRequestError,
  buildSnackCart,
  getSnackList,
  linkSnackOnAmazon,
  removeSnack,
  updateSnackNote,
  type CartBuild,
  type ProfileSummary,
  type SnackItem,
  type SnackList,
} from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { changedByLine, circleReportLine } from "../lib/correctionCopy";
import { JUDGE_LINK_NOT_FOUND } from "../lib/judgeLink";
import { addProfileHref } from "../lib/profileSections";
import {
  ADD_NOTE,
  AFFILIATE_DISCLOSURE,
  amazonLinkedBy,
  CART_BUILDING,
  CART_FAILED,
  CART_NOTE,
  CART_NOTHING,
  cartButtonLabel,
  cartIncludedLine,
  CHANGE_LINK,
  EDIT_NOTE,
  emptyLine,
  LABEL_WRONG,
  leftOutLine,
  LINK_AMAZON,
  LINK_AMAZON_HINT,
  LINK_AMAZON_LABEL,
  LINK_FAILED,
  LINK_SAVE,
  linkRefusedLine,
  LIST_FAILED,
  listTitle,
  NO_PROFILE,
  NOTE_CANCEL,
  NOTE_LABEL,
  NOTE_MAX,
  NOTE_SAVE,
  notCheckedLine,
  OPEN_CART,
  refusedLine,
  REMOVE,
  REMOVE_LINK,
  SCAN_WHEN_IT_ARRIVES,
  selectForCartLabel,
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
  const { snackListEnabled, snackSearchEnabled, snackCartsEnabled, loading } = useAuth();
  const { chosenProfileId, profiles, profilesLoaded } = useScanningFor();
  const profile = profiles.find((p) => p.id === scanningForId(chosenProfileId, profiles)) ?? null;
  const [list, setList] = useState<SnackList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reads, setReads] = useState(0);
  // Carts (SNACK_CARTS): the ticked items, by id. Cleared when the profile changes; an id that left
  // the list is dropped when the list reloads. The cart itself is built on the server from these ids.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cartBusy, setCartBusy] = useState(false);
  const [cartResult, setCartResult] = useState<CartBuild | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(new Set());
    setCartResult(null);
    setCartError(null);
  }, [profile?.id]);

  useEffect(() => {
    if (!profile || !snackListEnabled) return;
    let live = true;
    setError(null);
    getSnackList(profile.id)
      .then((l) => {
        if (!live) return;
        setList(l);
        const ids = new Set(l.items.map((i) => i.id));
        setSelected((prev) => new Set([...prev].filter((id) => ids.has(id))));
      })
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
  const shoppable = list?.items.filter((i) => i.shop) ?? [];
  // A profile with no allergens (plan decision 6; JT, Nov 14): a plain list. No verdict headline, no
  // screening-aid box — each card is the product, its note and the shop controls. Decided from the
  // server's count with each load, so an allergen added later brings the verdicts back by itself.
  const plain = list !== null && list.allergen_count === 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setCartResult(null);
  }

  async function buildCart() {
    if (selected.size === 0) return;
    setCartBusy(true);
    setCartError(null);
    setCartResult(null);
    try {
      setCartResult(await buildSnackCart(profile!.id, [...selected]));
    } catch {
      setCartError(CART_FAILED);
    } finally {
      setCartBusy(false);
    }
  }

  return (
    <main className="snacks">
      <h1>{listTitle(profile)}</h1>
      {/* In full once for the whole list; each item also carries the short line, as scan history does.
          Not on a plain list, and not before the list has said which kind this is. */}
      {list !== null && !plain && (
        <div role="note" className="verdict-card__disclaimer scan-history__disclaimer">
          <p>{DISCLAIMER}</p>
          <p>
            <strong>{EMERGENCY}</strong>
          </p>
        </div>
      )}

      {/* Search (SnackSearch.tsx, behind SNACK_SEARCH): above the list, for anyone who can see it; a
          result opens Scan for this profile, where only a manager gets "Add to". */}
      {snackSearchEnabled && <SnackSearch profile={profile} canManage={canManage} onAdded={refresh} />}

      {error && <p role="alert">{error}</p>}

      {/* An empty list (JT, Nov 14): a manager sees only the search box, which is the way in. A
          follower's line is unchanged. */}
      {list && list.items.length === 0 && !canManage && <p className="snacks__empty">{emptyLine(profile, false)}</p>}

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
              plain={plain}
              cartsEnabled={snackCartsEnabled}
              selected={selected.has(item.id)}
              onToggle={() => toggle(item.id)}
              onLinkAmazon={async (url) => {
                await linkSnackOnAmazon(profile.id, item.id, url);
                refresh();
              }}
            />
          ))}
        </ul>
      )}

      {snackCartsEnabled && shoppable.length > 0 && (
        <SnackCartPanel count={selected.size} busy={cartBusy} result={cartResult} error={cartError} onBuild={() => void buildCart()} />
      )}

      {list?.affiliate && <p className="card__meta snacks__affiliate">{AFFILIATE_DISCLOSURE}</p>}
    </main>
  );
}

/**
 * One item. The verdict first, in the card's colour and with its icon (styles.css [data-verdict]),
 * then the product (never who approved it — kept in the database, not shown; JT, Nov 14), the allergen
 * rows that claim anything, what changed the verdict,
 * the note, the "scan it when it arrives" line, the shop links when sent, the correction link on a
 * Contains item, and the manager's controls. Never the word "safe" (lib/verdictCopy.ts).
 */
export function SnackItemCard({
  item,
  profile,
  canManage,
  onRemove,
  onSaveNote,
  plain = false,
  cartsEnabled = false,
  selected = false,
  onToggle,
  onLinkAmazon,
}: {
  item: SnackItem;
  profile: Pick<ProfileSummary, "id" | "label" | "is_self">;
  canManage: boolean;
  onRemove: () => Promise<void>;
  onSaveNote: (note: string | null) => Promise<void>;
  /** A no-allergen profile's list: the product, its note and the shop controls, nothing about verdicts. */
  plain?: boolean;
  /** Carts (SNACK_CARTS): the checkbox on items with shop links, "Link on Amazon" for managers. */
  cartsEnabled?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  onLinkAmazon?: (url: string | null) => Promise<void>;
}) {
  const shown = item.effective ?? item.original;
  // Only an item the list will shop for can go in a cart or be linked: a "Contains" item has no shop
  // links (the server omits them) and the server refuses it from a cart anyway.
  const cartable = cartsEnabled && Boolean(item.shop);
  const [linking, setLinking] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
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

  // The paste box, opened by the one Amazon control: "Link on Amazon" (which also opens the Amazon
  // search in a new tab, so the address can be copied from there) or a linked item's "Change link".
  function openLinkForm() {
    setLinkDraft("");
    setLinkError(null);
    setLinking(true);
  }

  async function saveLink(e: FormEvent) {
    e.preventDefault();
    if (!onLinkAmazon) return;
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

  return (
    <li className="card snack-item" data-verdict={plain ? undefined : item.headline}>
      {!plain && <p className="verdict-card__headline snack-item__verdict">{VERDICT_LABEL[item.headline]}</p>}
      {cartable && (
        <label className="snack-item__select">
          <input type="checkbox" checked={selected} onChange={onToggle} aria-label={selectForCartLabel(item.product.name)} />
          <span aria-hidden="true">Amazon cart</span>
        </label>
      )}
      <p className="snack-item__product">
        <strong>{item.product.name ?? "Unknown product"}</strong>
        {item.product.brand && <span className="snack-item__brand"> — {item.product.brand}</span>}
        <span className="card__meta card__line snack-item__barcode">{item.barcode}</span>
      </p>

      {!plain && rows.length > 0 && (
        <ul className="history-entry__rows">
          {rows.map((m) => (
            <li key={m.allergenName}>
              {m.allergenName} ({m.severity}) — {historyRowLabel(m)}
            </li>
          ))}
        </ul>
      )}
      {!plain && unchecked.length > 0 && <p role="note">{notCheckedLine(unchecked)}</p>}

      {!plain && item.effective && (
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

      {!plain && <p className="card__meta snack-item__arrives">{SCAN_WHEN_IT_ARRIVES}</p>}

      {/* One Amazon control (JT, Nov 14). A manager with carts on and no link yet: "Link on Amazon",
          which is the Amazon search in a new tab and opens the paste box here. Otherwise "Shop on
          Amazon": the linked product when there is one (the server's link), else the search. */}
      {item.shop && (
        <p className="snack-item__shop">
          {cartable && canManage && onLinkAmazon && !item.amazon ? (
            <a className="button-link" href={item.shop.amazon} target="_blank" rel="noopener noreferrer" onClick={openLinkForm}>
              {LINK_AMAZON}
            </a>
          ) : (
            <a className="button-link" href={item.shop.amazon} target="_blank" rel="noopener noreferrer">
              {SHOP_AMAZON}
            </a>
          )}
          <a className="button-link" href={item.shop.instacart} target="_blank" rel="noopener noreferrer">
            {SHOP_INSTACART}
          </a>
        </p>
      )}
      {cartsEnabled && item.amazon && (
        <p className="card__meta snack-item__amazon">
          {amazonLinkedBy(item.amazon.linked_by, shortDate(item.amazon.linked_at))}
          {cartable && canManage && onLinkAmazon && !linking && (
            <>
              {" · "}
              <button type="button" className="link-button" disabled={busy} onClick={openLinkForm}>
                {CHANGE_LINK}
              </button>
            </>
          )}
        </p>
      )}

      {!plain && item.headline === "contains_allergen" && (
        <p className="snack-item__report">
          <Link to={snackReportPath(profile.id, item.id)}>{LABEL_WRONG}</Link>
        </p>
      )}

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
              <button type="button" disabled={busy} onClick={() => void run(() => onLinkAmazon!(null), LINK_FAILED).then(() => setLinking(false))}>
                {REMOVE_LINK}
              </button>
            )}
          </p>
        </form>
      )}

      {failed && <p role="alert">{failed}</p>}

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
          <button type="button" disabled={busy} onClick={() => void run(onRemove, "Couldn't remove it. Try again.")}>
            {REMOVE}
          </button>
        </p>
      )}

      {!plain && <p className="history-entry__disclaimer">{DISCLAIMER_SHORT}</p>}
    </li>
  );
}

/**
 * "Add selected to Amazon cart" (the addendum's part B): one button for the ticked items, and what
 * the server made of them — the one cart link, who went in, who was left out for want of an Amazon
 * link, and who was refused because the server's own re-check reads "Contains an allergen" now.
 */
export function SnackCartPanel({
  count,
  busy,
  result,
  error,
  onBuild,
}: {
  count: number;
  busy: boolean;
  result: CartBuild | null;
  error: string | null;
  onBuild: () => void;
}) {
  return (
    <div className="snacks__cart" aria-label="Amazon cart">
      <p className="snacks__cart-actions">
        <button type="button" className="button-primary" disabled={busy || count === 0} onClick={onBuild}>
          {busy ? CART_BUILDING : cartButtonLabel(count)}
        </button>
      </p>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div role="status" className="snacks__cart-result">
          {result.url ? (
            <>
              <p>{cartIncludedLine(result.included.length)}</p>
              <p>
                <a className="button-link" href={result.url} target="_blank" rel="noopener noreferrer">
                  {OPEN_CART}
                </a>
              </p>
            </>
          ) : (
            <p>{CART_NOTHING}</p>
          )}
          {result.left_out.length > 0 && <p>{leftOutLine(result.left_out.map((i) => i.name))}</p>}
          {result.refused.length > 0 && <p>{refusedLine(result.refused.map((i) => i.name))}</p>}
          {result.url && <p className="card__meta">{CART_NOTE}</p>}
        </div>
      )}
    </div>
  );
}
