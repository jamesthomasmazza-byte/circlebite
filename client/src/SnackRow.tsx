import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { ProductPhoto } from "./ProductPhoto";
import { ApiRequestError, type ProfileSummary, type SnackItem } from "./lib/api";
import {
  LINK_AMAZON,
  LINK_AMAZON_HINT,
  LINK_AMAZON_LABEL,
  LINK_FAILED,
  LINK_SAVE,
  linkRefusedLine,
  NOT_FOR_CART,
  NOTE_CANCEL,
  ON_AMAZON,
  pillAllergens,
  selectForCartLabel,
  snackDetailPath,
  UNKNOWN_PRODUCT,
  verdictPill,
} from "./lib/snackListCopy";

/**
 * One compact row of the Snacks tab (JT's mockup, Nov 14): the photo, the name, the brand (and
 * "· On Amazon" once linked), and a small verdict pill naming the allergens — "Contains: Peanut",
 * "May contain: Sesame", "No listed allergens", "Unable to confirm" — in the verdict's own colour.
 * Tapping the row opens the item's detail page. The right side (JT, Nov 14, after the phone test):
 * the Amazon-cart checkbox only once the item has an Amazon link; before that a manager gets a small
 * "Link on Amazon" there — the Amazon search in a new tab and the paste box inline under the row — and
 * a follower nothing; "Not for cart" on a "Contains" item, which the server sends without shop links.
 * Nothing else: no note, no per-item disclaimer (one note per page). A no-allergen profile's row has
 * no pill. Never the word "safe".
 */
export function SnackRow({
  item,
  profile,
  plain = false,
  cartsEnabled = false,
  canManage = false,
  selected = false,
  onToggle,
  onLinkAmazon,
}: {
  item: SnackItem;
  profile: Pick<ProfileSummary, "id" | "label" | "is_self">;
  plain?: boolean;
  cartsEnabled?: boolean;
  canManage?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  /** "Link on Amazon" on the row, for a manager: the pasted link goes to the server, which keeps the ASIN. */
  onLinkAmazon?: (url: string) => Promise<void>;
}) {
  const shown = item.effective ?? item.original;
  const name = item.product.name ?? UNKNOWN_PRODUCT;
  const [linking, setLinking] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const canLink = cartsEnabled && canManage && Boolean(item.shop) && !item.amazon && Boolean(onLinkAmazon);

  async function saveLink(e: FormEvent) {
    e.preventDefault();
    if (!onLinkAmazon) return;
    setBusy(true);
    setLinkError(null);
    try {
      await onLinkAmazon(draft.trim());
      setLinking(false);
      setDraft("");
    } catch (err) {
      setLinkError(err instanceof ApiRequestError && err.message === "invalid_amazon_link" ? linkRefusedLine(draft) : LINK_FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="snack-row" data-verdict={plain ? undefined : item.headline}>
      <Link className="snack-row__main" to={snackDetailPath(profile.id, item.id)}>
        <ProductPhoto src={item.product.image_small} size="row" />
        <span className="snack-row__text">
          <strong className="snack-row__name">{name}</strong>
          {(item.product.brand || item.amazon) && (
            <span className="snack-row__brand card__meta">
              {item.product.brand}
              {item.amazon && (item.product.brand ? ` · ${ON_AMAZON}` : ON_AMAZON)}
            </span>
          )}
          {!plain && <span className="verdict-pill snack-row__pill">{verdictPill(item.headline, pillAllergens(item.headline, shown.matched_allergens))}</span>}
        </span>
      </Link>
      {cartsEnabled && !item.shop && <span className="snack-row__nocart card__meta">{NOT_FOR_CART}</span>}
      {cartsEnabled && item.shop && item.amazon && (
        <label className="snack-row__select">
          <input type="checkbox" checked={selected} onChange={onToggle} aria-label={selectForCartLabel(item.product.name)} />
        </label>
      )}
      {canLink && item.shop && (
        <a
          className="snack-row__link"
          href={item.shop.amazon}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${LINK_AMAZON}: ${name}`}
          onClick={() => {
            setDraft("");
            setLinkError(null);
            setLinking(true);
          }}
        >
          {LINK_AMAZON}
        </a>
      )}
      {linking && canLink && (
        <form className="snack-item__note-form snack-item__link-form snack-row__link-form" onSubmit={(e) => void saveLink(e)}>
          <label>
            {LINK_AMAZON_LABEL}
            <input type="url" inputMode="url" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} required />
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
          </p>
        </form>
      )}
    </li>
  );
}
