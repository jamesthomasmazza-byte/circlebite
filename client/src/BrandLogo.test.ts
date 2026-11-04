import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BrandLogo, LOGO_DARK, LOGO_LIGHT } from "./BrandLogo";

const file = (path: string) => new URL(`../${path}`, import.meta.url);
const pub = (url: string) => file(`public${url}`);

test("the logo: the dark file for a dark system theme, the light one otherwise, named CircleBite", () => {
  const html = renderToStaticMarkup(createElement(BrandLogo, { className: "x" }));
  assert.match(html, new RegExp(`<source media="\\(prefers-color-scheme: dark\\)" srcSet="${LOGO_DARK}"/>`));
  assert.match(html, new RegExp(`<img src="${LOGO_LIGHT}" alt="CircleBite"`));
  for (const url of [LOGO_LIGHT, LOGO_DARK]) assert.ok(existsSync(pub(url)), url);
});

test("both variants are transparent, and the dark one uses the dark theme's colours", () => {
  const light = readFileSync(pub(LOGO_LIGHT), "utf8");
  const dark = readFileSync(pub(LOGO_DARK), "utf8");
  for (const svg of [light, dark]) assert.doesNotMatch(svg, /#FFFFFF/i, "no white background");
  assert.match(light, /fill="#0D3D41"/);
  assert.doesNotMatch(dark, /#0D3D41|#005C65/i, "no light-theme ink left on the dark background");
  assert.match(dark, /fill="#EEF0F4"/);
  // Those are the dark theme's tokens, so a change there shows here.
  const css = readFileSync(file("src/styles.css"), "utf8");
  const darkBlock = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
  assert.match(darkBlock, /--color-text: #eef0f4;/);
  assert.match(darkBlock, /--color-accent: #6fcfc8;/);
});

test("the header and the landing page show the logo in place of the text wordmark", () => {
  assert.match(readFileSync(file("src/TabShell.tsx"), "utf8"), /<BrandLogo className="shell-header__wordmark" \/>/);
  assert.match(readFileSync(file("src/routes/Landing.tsx"), "utf8"), /<BrandLogo className="landing__logo" \/>/);
});

test("index.html links the favicon, the home-screen icon and the manifest, and each file exists", () => {
  const index = readFileSync(file("index.html"), "utf8");
  for (const href of ["/favicon.svg", "/icon-192.png", "/apple-touch-icon.png", "/manifest.webmanifest"]) {
    assert.match(index, new RegExp(`href="${href.replace(".", "\\.")}"`), href);
    assert.ok(existsSync(pub(href)), href);
  }
  const manifest = JSON.parse(readFileSync(pub("/manifest.webmanifest"), "utf8"));
  assert.equal(manifest.display, "browser", "a home-screen icon opens the site as it is today");
  for (const icon of manifest.icons) assert.ok(existsSync(pub(icon.src)), icon.src);
});
