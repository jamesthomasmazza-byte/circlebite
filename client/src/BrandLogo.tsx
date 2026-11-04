/**
 * The CircleBite logo in place of the text wordmark (2026-11-04), light or dark with the system
 * theme, as the rest of the app follows it (styles.css, prefers-color-scheme). Its alt text keeps
 * the accessible name the text wordmark had. Files: client/public/brand/, built by
 * scripts/brand-assets.ts from client/src/brand/.
 */
export const LOGO_LIGHT = "/brand/circlebite-logo-horizontal-light.svg";
export const LOGO_DARK = "/brand/circlebite-logo-horizontal-dark.svg";

export function BrandLogo({ className }: { className: string }) {
  return (
    <picture className={className}>
      <source media="(prefers-color-scheme: dark)" srcSet={LOGO_DARK} />
      <img src={LOGO_LIGHT} alt="CircleBite" width={1464} height={316} />
    </picture>
  );
}
