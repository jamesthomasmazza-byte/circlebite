import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { SnackRow } from "../SnackRow";
import { SnackSearch } from "../SnackSearch";
import { useScanningFor } from "../TabShell";
import { buildSnackCart, getSnackList, linkSnackOnAmazon, type CartBuild, type SnackList } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { JUDGE_LINK_NOT_FOUND } from "../lib/judgeLink";
import { addProfileHref } from "../lib/profileSections";
import {
  AFFILIATE_DISCLOSURE,
  CART_BUILDING,
  CART_FAILED,
  CART_NOTE,
  CART_NOTHING,
  cartBarLabel,
  cartIncludedLine,
  emptyLine,
  itemCount,
  leftOutLine,
  LIST_FAILED,
  listTitle,
  NO_PROFILE,
  OPEN_CART,
  refusedLine,
  SCREENING_NOTE,
} from "../lib/snackListCopy";
import { scanningForId } from "../lib/tabs";

/**
 * The Snacks tab (docs/snack-list-plan.md, 2026-11-13; rebuilt to JT's mockup Nov 14; behind
 * SNACK_LIST): the chosen profile's list as compact rows — photo, name, brand, a verdict pill naming
 * the allergens — in the order the server sends it (flagged items first), each item's verdict as it
 * is now, computed from stored data with no AI call. One screening note under the title instead of a
 * disclaimer per item; a row opens the item's detail page (SnackDetail.tsx), which holds the full
 * verdict, the note and every action. The Amazon-cart checkbox sits at the right of each row and a
 * sticky bar above the tab bar builds the cart on the server. The profile is the shell's chosen one,
 * the same value as Scan's pill, so moving between Scan and Snacks keeps the same child.
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
        // Only a linked item can be ticked (JT, Nov 14): an id that left the list, or lost its link, drops out.
        const linked = new Set(l.items.filter((i) => i.amazon && i.shop).map((i) => i.id));
        setSelected((prev) => new Set([...prev].filter((id) => linked.has(id))));
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
  const linkable = shoppable.filter((i) => i.amazon).length;
  // A profile with no allergens (plan decision 6; JT, Nov 14): a plain list. No verdict pills, no
  // screening note. Decided from the server's count with each load, so an allergen added later brings
  // the verdicts back by itself.
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
      <div className="snacks__title">
        <h1>{listTitle(profile)}</h1>
        {list && <span className="snacks__count card__meta">{itemCount(list.items.length)}</span>}
      </div>
      {/* One compact note for the page (docs/verdict-engine.md rule 9, moved from each item to the page
          and the detail page; JT, Nov 14). Not on a plain list, and not before the list has said which
          kind this is. */}
      {list !== null && !plain && (
        <p role="note" className="snacks__note">
          {SCREENING_NOTE}
        </p>
      )}

      {/* Search (SnackSearch.tsx, behind SNACK_SEARCH): above the list, for anyone who can see it. */}
      {snackSearchEnabled && <SnackSearch profile={profile} canManage={canManage} onAdded={refresh} />}

      {error && <p role="alert">{error}</p>}

      {/* An empty list (JT, Nov 14): a manager sees only the search box, which is the way in. */}
      {list && list.items.length === 0 && !canManage && <p className="snacks__empty">{emptyLine(profile, false)}</p>}

      {list && list.items.length > 0 && (
        <ul className="snacks__rows">
          {list.items.map((item) => (
            <SnackRow
              key={item.id}
              item={item}
              profile={profile}
              plain={plain}
              cartsEnabled={snackCartsEnabled}
              canManage={canManage}
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

      {list?.affiliate && <p className="card__meta snacks__affiliate">{AFFILIATE_DISCLOSURE}</p>}

      {/* The bar once anything on the list can go in a cart: a linked item for anyone, or an item a
          manager could link. The count is the ticked, linked items. */}
      {snackCartsEnabled && (linkable > 0 || (canManage && shoppable.length > 0)) && (
        <SnackCartBar count={selected.size} busy={cartBusy} result={cartResult} error={cartError} onBuild={() => void buildCart()} />
      )}
    </main>
  );
}

/**
 * The sticky bar above the tab bar (JT's mockup, Nov 14): "Add N to Amazon cart" for the ticked
 * items, disabled at none, and what the server made of them — the one cart link, who went in, who
 * was left out for want of an Amazon link, and who was refused because the server's own re-check
 * reads "Contains an allergen" now.
 */
export function SnackCartBar({
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
    <div className="snacks__cart-bar" aria-label="Amazon cart">
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
      <p className="snacks__cart-actions">
        <button type="button" className="button-primary" disabled={busy || count === 0} onClick={onBuild}>
          {busy ? CART_BUILDING : cartBarLabel(count)}
        </button>
      </p>
    </div>
  );
}
