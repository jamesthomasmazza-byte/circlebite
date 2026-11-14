// "Link on Amazon" (docs/snack-list-plan.md addendum part B, 2026-11-14): a manager pastes an
// amazon.com product link; only the ASIN is kept. The pasted URL itself is never stored (it can carry
// tracking and the manager's own session bits), and nothing is ever fetched to resolve it: a short
// link (a.co, amzn.to, amzn.com) would have to be followed to find out what it is, so it is refused.

/** Ten characters, A–Z and digits — Amazon's own identifier shape (ISBN-10s with X included by the Z). */
const ASIN_SHAPE = /^[A-Z0-9]{10}$/;

/** amazon.com and its subdomains (www., smile., m.). Other marketplaces have their own catalogues and
 *  cart URLs; the cart link is amazon.com's (snackList/cartLink.ts), so only its ASINs make sense. */
const AMAZON_HOST = /^(?:[a-z0-9-]+\.)*amazon\.com$/i;

/** `/dp/<ASIN>` or `/gp/product/<ASIN>`, anywhere in the path (titles come first: /Some-Title/dp/B0…). */
const PATH_ASIN = /\/(?:dp|gp\/product)\/([A-Za-z0-9]{10})(?:[/?#]|$)/;

/**
 * The ASIN in an amazon.com product link, uppercased, or null for anything else: not a URL, not
 * amazon.com, a short link, a search page, a page without /dp/ or /gp/product/, or an identifier of
 * the wrong shape. Null is a 400 to the manager, never a guess.
 */
export function asinFromAmazonLink(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (text.length === 0 || text.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!AMAZON_HOST.test(url.hostname)) return null;
  const match = PATH_ASIN.exec(url.pathname);
  if (!match) return null;
  const asin = match[1].toUpperCase();
  return ASIN_SHAPE.test(asin) ? asin : null;
}

/** The product page for a stored ASIN, with the Associates tag only when set. */
export function amazonProductUrl(asin: string, options: { amazonAssociateTag?: string } = {}): string {
  const tag = options.amazonAssociateTag?.trim();
  return `https://www.amazon.com/dp/${encodeURIComponent(asin)}${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`;
}
