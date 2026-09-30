import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Verifies the contrast ratios styles.css claims, instead of trusting the comments. Parses the
// actual token values out of the stylesheet — light from the first :root block, dark from the
// prefers-color-scheme block — so a colour changed without re-checking fails here.

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, name, hex] of block.matchAll(/--(color-[a-z-]+):\s*(#[0-9a-f]{6})\b/gi)) out[name] = hex;
  return out;
}

const lightBlock = css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme: dark)"));
const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const darkBlock = css.slice(darkStart, css.indexOf("/* ---------- Document", darkStart));
const light = tokens(lightBlock);
const dark = { ...light, ...tokens(darkBlock) };

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// 7:1 for text — AAA, because sunlight on a phone eats contrast. 3:1 for non-text (WCAG 1.4.11).
const TEXT = 7;
const NON_TEXT = 3;

const PAIRS: [fg: string, bg: string, min: number][] = [
  ["color-text", "color-bg", TEXT],
  ["color-text", "color-surface", TEXT],
  ["color-text-muted", "color-bg", TEXT],
  ["color-text-muted", "color-surface", TEXT],
  ["color-link", "color-bg", TEXT],
  ["color-link", "color-surface", TEXT],
  ["color-on-accent", "color-accent", TEXT],
  ["color-alert", "color-bg", TEXT],
  ["color-border", "color-bg", NON_TEXT],
  ["color-focus", "color-bg", NON_TEXT],
  ["color-focus", "color-surface", NON_TEXT],
  ["color-safe-text", "color-safe-bg", TEXT],
  ["color-caution-text", "color-caution-bg", TEXT],
  ["color-contains-text", "color-contains-bg", TEXT],
  ["color-unknown-text", "color-unknown-bg", TEXT],
  ["color-text", "color-safe-bg", TEXT],
  ["color-text", "color-caution-bg", TEXT],
  ["color-text", "color-contains-bg", TEXT],
  ["color-text", "color-unknown-bg", TEXT],
  ["color-safe-line", "color-bg", NON_TEXT],
  ["color-caution-line", "color-bg", NON_TEXT],
  ["color-contains-line", "color-bg", NON_TEXT],
  ["color-unknown-line", "color-bg", NON_TEXT],
  // The state rules sit against their own tint as well as the page.
  ["color-safe-line", "color-safe-bg", NON_TEXT],
  ["color-caution-line", "color-caution-bg", NON_TEXT],
  ["color-contains-line", "color-contains-bg", NON_TEXT],
  ["color-unknown-line", "color-unknown-bg", NON_TEXT],
];

for (const [scheme, palette] of [["light", light], ["dark", dark]] as const) {
  test(`${scheme}: every foreground/background pair meets its contrast target`, () => {
    const failures: string[] = [];
    for (const [fg, bg, min] of PAIRS) {
      assert.ok(palette[fg], `${scheme}: --${fg} not found in styles.css`);
      assert.ok(palette[bg], `${scheme}: --${bg} not found in styles.css`);
      const r = ratio(palette[fg], palette[bg]);
      if (r < min) failures.push(`--${fg} on --${bg}: ${r.toFixed(2)}:1, needs ${min}:1`);
    }
    assert.deepEqual(failures, []);
  });
}

test("the dark block actually overrides every colour token", () => {
  assert.deepEqual(Object.keys(tokens(darkBlock)).sort(), Object.keys(light).sort());
});

test("every ratio written in a styles.css comment matches the computed one", () => {
  // Two forms, both checked: "N:1 on name" (this token against --color-name) and "body text on it:
  // N:1" (--color-text against this token).
  const stale: string[] = [];
  let checked = 0;
  for (const [block, palette] of [[lightBlock, light], [darkBlock, dark]] as const) {
    for (const [, hex, comment] of block.matchAll(/(#[0-9a-f]{6});\s*\/\*([^*]*)\*\//gi)) {
      for (const [, stated, against] of comment.matchAll(/([\d.]+):1 on ([a-z-]+)/g)) {
        const bgName = against.startsWith("color-") ? against : `color-${against}`;
        assert.ok(palette[bgName], `comment names --${bgName}, which isn't a token`);
        checked++;
        const actual = ratio(hex, palette[bgName]).toFixed(2);
        if (actual !== stated) stale.push(`${hex} on --${bgName}: comment says ${stated}, actual ${actual}`);
      }
      for (const [, stated] of comment.matchAll(/body text on it: ([\d.]+):1/g)) {
        checked++;
        const actual = ratio(palette["color-text"], hex).toFixed(2);
        if (actual !== stated) stale.push(`text on ${hex}: comment says ${stated}, actual ${actual}`);
      }
    }
  }
  assert.ok(checked > 40, `only ${checked} stated ratios found — has the comment format changed?`);
  assert.deepEqual(stale, []);
});
