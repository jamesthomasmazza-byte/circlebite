// A product's front photo (JT's mockup, Nov 14): Open Food Facts' image when the product record has
// one, else a neutral placeholder with a picture icon — the seeded Hearthfield products have none.
// Decorative: the name beside it carries the meaning, so the image has an empty alt.

export function ProductPhoto({ src, size }: { src: string | null | undefined; size: "row" | "detail" }) {
  if (src) {
    return <img className={`product-photo product-photo--${size}`} src={src} alt="" loading="lazy" decoding="async" />;
  }
  return (
    <span className={`product-photo product-photo--${size} product-photo--empty`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8.5" cy="10" r="1.5" />
        <path d="M21 16l-5-5-8 8" />
      </svg>
    </span>
  );
}
