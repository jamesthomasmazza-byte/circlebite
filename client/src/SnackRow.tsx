import { Link } from "react-router-dom";

import { ProductPhoto } from "./ProductPhoto";
import type { ProfileSummary, SnackItem } from "./lib/api";
import { NOT_FOR_CART, ON_AMAZON, pillAllergens, selectForCartLabel, snackDetailPath, UNKNOWN_PRODUCT, verdictPill } from "./lib/snackListCopy";

/**
 * One compact row of the Snacks tab (JT's mockup, Nov 14): the photo, the name, the brand (and
 * "· On Amazon" once linked), and a small verdict pill naming the allergens — "Contains: Peanut",
 * "May contain: Sesame", "No listed allergens", "Unable to confirm" — in the verdict's own colour.
 * Tapping the row opens the item's detail page; the right side holds the Amazon-cart checkbox, or
 * "Not for cart" on a "Contains" item, which the server sends without shop links. Nothing else: no
 * buttons, no note, no per-item disclaimer (one note per page). A no-allergen profile's row has no
 * pill. Never the word "safe".
 */
export function SnackRow({
  item,
  profile,
  plain = false,
  cartsEnabled = false,
  selected = false,
  onToggle,
}: {
  item: SnackItem;
  profile: Pick<ProfileSummary, "id" | "label" | "is_self">;
  plain?: boolean;
  cartsEnabled?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const shown = item.effective ?? item.original;
  const name = item.product.name ?? UNKNOWN_PRODUCT;
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
      {cartsEnabled &&
        (item.shop ? (
          <label className="snack-row__select">
            <input type="checkbox" checked={selected} onChange={onToggle} aria-label={selectForCartLabel(item.product.name)} />
          </label>
        ) : (
          <span className="snack-row__nocart card__meta">{NOT_FOR_CART}</span>
        ))}
    </li>
  );
}
