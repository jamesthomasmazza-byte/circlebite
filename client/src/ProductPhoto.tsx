import { useEffect, useState } from "react";

// A product's front photo (JT's mockup, Nov 14): Open Food Facts' image when the product record has
// one, else a neutral placeholder with a picture icon — the seeded Hearthfield products have none, and
// so does an image that fails to load (the placeholder takes over; JT, Nov 14). Decorative: the name
// beside it carries the meaning, so the image has an empty alt. No referrer goes to Open Food Facts
// (referrerPolicy), and list rows load lazily.

export function ProductPhoto({ src, size }: { src: string | null | undefined; size: "row" | "detail" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed) {
    return (
      <img
        className={`product-photo product-photo--${size}`}
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        loading={size === "row" ? "lazy" : undefined}
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
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
