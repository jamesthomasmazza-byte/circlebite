/**
 * Shop links for a snack list item (docs/snack-list-plan.md decisions 8 and 9): plain search URLs on
 * each store, opened by the client in a new tab. No store API, no key, and no claim that the result
 * is the exact product — the list says "Scan it when it arrives".
 *
 * The query is the product's name and brand when the record has a name, else the barcode (JT, Nov
 * 13): a name finds the product on both stores; a bare GTIN finds it on Amazon sometimes and on
 * Instacart rarely, so it is the fallback, not the first try.
 *
 * Amazon Associates adds its tag as a query parameter, appended only when AMAZON_ASSOCIATE_TAG is set.
 * Instacart's affiliate tracking runs through Impact redirect links, not a parameter, so there is
 * nothing to append here; wiring it waits on the program's terms after judging. Neither store ever
 * touches a verdict or the order of a list.
 *
 * The route omits these entirely for an item whose effective verdict is "Contains an allergen"
 * (decision 2): the client never receives a link it must hide.
 */

export type ShopLinks = {
  amazon: string;
  instacart: string;
  /** True when the Amazon link carries an Associates tag, so the client shows the disclosure line. */
  affiliate: boolean;
};

export type ShoppableProduct = { barcode: string; name: string | null; brand: string | null };

export function shopQuery(product: ShoppableProduct): string {
  const name = product.name?.trim() ?? "";
  if (!name) return product.barcode;
  const brand = product.brand?.trim() ?? "";
  // Many records repeat the brand inside the name ("Cheerios Honey Nut Cheerios"); don't say it twice.
  if (!brand || name.toLowerCase().includes(brand.toLowerCase())) return name;
  return `${name} ${brand}`;
}

export function buildShopLinks(product: ShoppableProduct, options: { amazonAssociateTag?: string } = {}): ShopLinks {
  const q = encodeURIComponent(shopQuery(product));
  const tag = options.amazonAssociateTag?.trim();
  return {
    amazon: `https://www.amazon.com/s?k=${q}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`,
    instacart: `https://www.instacart.com/store/s?k=${q}`,
    affiliate: Boolean(tag),
  };
}
