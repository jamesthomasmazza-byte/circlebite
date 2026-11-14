// "Add selected to Amazon cart" (docs/snack-list-plan.md addendum part B, 2026-11-14): one link to
// Amazon's add-to-cart form with every selected ASIN, quantity 1 each, and the Associates tag only
// when set. Checked by JT in Chrome, Nov 14: Amazon carries every ASIN through to its add-to-cart
// step after sign-in. Built on the server only (routes/snackList.ts), which re-checks each item's
// verdict first and refuses a "Contains" item, so the client never assembles a cart itself.

export const CART_ADD_URL = "https://www.amazon.com/gp/aws/cart/add.html";

/** One link for one or more ASINs, in the order given. No ASINs is null: there is no empty cart link. */
export function buildCartLink(asins: readonly string[], options: { amazonAssociateTag?: string } = {}): string | null {
  if (asins.length === 0) return null;
  const params = new URLSearchParams();
  asins.forEach((asin, i) => {
    params.set(`ASIN.${i + 1}`, asin);
    params.set(`Quantity.${i + 1}`, "1");
  });
  const tag = options.amazonAssociateTag?.trim();
  if (tag) params.set("AssociateTag", tag);
  return `${CART_ADD_URL}?${params.toString()}`;
}
