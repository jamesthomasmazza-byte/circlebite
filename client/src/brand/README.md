# CircleBite logo

The CircleBite mark and wordmark, on a white background. Bundled by Vite and served from our own
server, like `../fonts/`. Import a file where it is used, so Vite fingerprints it:

```tsx
import logo from "../brand/circlebite-logo-horizontal.svg";

<img src={logo} alt="CircleBite" />
```

- **Made:** 2026-11-04, with Claude, for the pre-seed pitch deck and the website
- **Mark:** the circle from the deck's closing slide ("Join the circle."): a child's profile at the
  centre, five caregivers on a dashed ring
- **Colours:** existing tokens from `../styles.css` only. Circles `#6fcfc8` (the dark theme's
  `--color-accent`), ring and "Bite" `#005c65` (`--color-accent`), "Circle" `#0d3d41` (the dark
  theme's `--color-band-bg`), background `#ffffff` (`--color-bg`)
- **Wordmark:** Bricolage Grotesque ExtraBold (800), from `@fontsource/bricolage-grotesque` 5.3.0,
  converted to outlines. The SVGs hold paths, not text, so no font is loaded and none is bundled.
  The typeface is under the SIL Open Font License 1.1, which allows using it in artwork such as a
  logo
- **SVG vs PNG:** prefer the SVG on the site (sharp at any size, a few kB). The PNGs are 2x renders
  for places that need a raster image, such as email or social previews

The light circles (`#6fcfc8`) are decoration, not text, so they carry no contrast requirement. The
wordmark meets 4.5:1 on white in both colours.

| File | Size | SHA-256 |
|---|---|---|
| `circlebite-logo-horizontal.svg` | vector | `eef580360f55f68cc9aac12694ca48b809510a40e0d52c2064746b4b555c742b` |
| `circlebite-logo-horizontal.png` | 3294×1040 | `3ab12facd363ea71e0ca806a8552314ae713c69361742eadbaaea9a2c30108e1` |
| `circlebite-logo-stacked.svg` | vector | `20614f5d1b69597509326a229329630758e92a8052194eefd2863ba725e94b23` |
| `circlebite-logo-stacked.png` | 2332×1848 | `2aadf4519097b4bda9f03362215f54968f316462d15fb989cf9901d053adbc98` |
| `circlebite-icon.svg` | vector | `16125061acc6f6e1e210f20b99d9ea043a5e7a5fe3984f7168361b77951144b1` |
| `circlebite-icon.png` | 1600×1600 | `ed71a286a2c8cc8538e17bfbc22c1bb55f3f2d2353f58dbb97f06a198f814d41` |

## What the app uses

These originals, drawn on white, are the source. `scripts/brand-assets.ts` builds what the app
serves from them, into `client/public/` (rerun it after changing an original):
- `brand/circlebite-logo-horizontal-light.svg` and `-dark.svg`: transparent, cropped to the
  drawing, for the header and the landing page (`client/src/BrandLogo.tsx`). The dark one uses the
  dark theme's tokens: "Circle" `#eef0f4` (`--color-text`), "Bite" and the ring `#6fcfc8`
  (`--color-accent`).
- `favicon.svg`: the icon, whose ring turns light in a dark browser theme.
- `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` and `manifest.webmanifest`: the
  home-screen icon, on white, because iOS fills a transparent one with black.

They are served by URL rather than imported, because the client's tests render components under
plain Node, which can't import an SVG. So they aren't fingerprinted: `lib/serveClient.ts` serves
them `no-cache`, revalidated on each load.
