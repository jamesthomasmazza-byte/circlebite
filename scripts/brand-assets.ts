// Builds every logo file the app uses from JT's originals in client/src/brand/ (drawn on white):
//   client/public/brand/  circlebite-logo-horizontal-{light,dark}.svg: transparent, cropped to
//                      the drawing, for the app's header and the landing page. Served by URL, not
//                      imported: the client's tests run components under plain Node, which can't
//                      import an SVG.
//   client/public/     favicon.svg (switches with the browser's theme), manifest.webmanifest, and
//                      apple-touch-icon.png, icon-192.png, icon-512.png (on white: iOS fills a
//                      transparent home-screen icon with black)
// From the repo root:
//   node_modules/.bin/tsx scripts/brand-assets.ts [--chrome=<path to a headless Chrome>]
// The PNGs need a browser to render them; without --chrome the SVGs and the manifest are still
// written, and the PNGs are left as they are. No dependency: the SVGs are edited as text.
//
// Dark variant colours are the dark theme's own tokens (client/src/styles.css): "Circle"
// #eef0f4 (--color-text), "Bite" and the ring #6fcfc8 (--color-accent). The light ring #005c65
// would all but vanish on the dark background #101216.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const brand = resolve(root, "client/src/brand");
const pub = resolve(root, "client/public");
mkdirSync(pub, { recursive: true });

// The drawing's bounds, measured with getBBox in Chrome (2026-11-04), padded past the ring's stroke.
const HORIZONTAL_VIEWBOX = "100 92 1464 316";
const ICON_VIEWBOX = "124 112 552 552";

const read = (name: string) => readFileSync(resolve(brand, name), "utf8");

/** Drops the white background and crops to the drawing. */
function transparent(svg: string, viewBox: string): string {
  const [, , w, h] = viewBox.split(" ");
  const out = svg
    .replace(/<rect width="\d+" height="\d+" fill="#FFFFFF"\/>\n?/, "")
    .replace(/width="\d+" height="\d+" viewBox="[^"]+"/, `width="${w}" height="${h}" viewBox="${viewBox}"`);
  if (out.includes('fill="#FFFFFF"') || !out.includes(`viewBox="${viewBox}"`)) throw new Error("unexpected logo SVG shape");
  return out;
}

const dark = (svg: string) =>
  svg.replaceAll('fill="#0D3D41"', 'fill="#EEF0F4"').replaceAll('fill="#005C65"', 'fill="#6FCFC8"').replaceAll('stroke="#005C65"', 'stroke="#6FCFC8"');

const horizontal = transparent(read("circlebite-logo-horizontal.svg"), HORIZONTAL_VIEWBOX);
const icon = transparent(read("circlebite-icon.svg"), ICON_VIEWBOX);
mkdirSync(resolve(pub, "brand"), { recursive: true });
writeFileSync(resolve(pub, "brand/circlebite-logo-horizontal-light.svg"), horizontal);
writeFileSync(resolve(pub, "brand/circlebite-logo-horizontal-dark.svg"), dark(horizontal));

// The favicon follows the browser's theme inside the SVG itself: only the ring changes.
writeFileSync(
  resolve(pub, "favicon.svg"),
  icon
    .replace('stroke="#005C65"', 'class="ring" stroke="#005C65"')
    .replace(/(<svg[^>]*>)/, "$1\n<style>@media (prefers-color-scheme: dark) { .ring { stroke: #6FCFC8; } }</style>"),
);

writeFileSync(
  resolve(pub, "manifest.webmanifest"),
  JSON.stringify(
    {
      name: "CircleBite",
      short_name: "CircleBite",
      description: "Check every label against your child's allergies.",
      start_url: "/",
      // "browser", not "standalone": a home-screen icon opens the site as it is today, address bar
      // and all, so nothing about the camera or sign-in changes.
      display: "browser",
      background_color: "#ffffff",
      theme_color: "#005c65",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
      ],
    },
    null,
    2,
  ) + "\n",
);

const chrome = process.argv.find((a) => a.startsWith("--chrome="))?.slice("--chrome=".length);
if (!chrome) {
  console.log("SVGs and manifest written. PNGs not rendered: pass --chrome=<path> to render them.");
} else {
  // The icon on white, with a little more margin than the favicon: home screens round the corners.
  const onWhite = (size: number) =>
    `<!doctype html><html><body style="margin:0;background:#fff"><div style="width:${size}px;height:${size}px;display:grid;place-items:center">` +
    icon.replace(/width="\d+" height="\d+"/, `width="${Math.round(size * 0.84)}" height="${Math.round(size * 0.84)}"`) +
    "</div></body></html>";
  for (const [name, size] of [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]] as const) {
    const page = resolve(pub, `.render-${size}.html`);
    writeFileSync(page, onWhite(size));
    execFileSync(chrome, ["--hide-scrollbars", `--window-size=${size},${size}`, `--screenshot=${resolve(pub, name)}`, `file://${page}`], { stdio: "ignore" });
    rmSync(page);
  }
  console.log("SVGs, manifest and PNGs written.");
}
