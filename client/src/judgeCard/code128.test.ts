import assert from "node:assert/strict";
import { test } from "node:test";

import { BitArray, Code128Reader } from "@zxing/library";

import { code128Svg, code128Values, code128Widths, PATTERNS } from "./code128";

/** The shared judge barcode; judgeCard.test.ts ties the card to the seed's. */
const JUDGE_BARCODE = "2990000000083";

/** Decodes widths the way the app's scanner does, with zxing's own Code 128 reader, as one row of bars. */
function decode(widths: number[], quiet = 12): string {
  const size = widths.reduce((a, b) => a + b, 0) + 2 * quiet;
  const row = new BitArray(size);
  let x = quiet;
  widths.forEach((w, i) => {
    if (i % 2 === 0) for (let k = 0; k < w; k++) row.set(x + k);
    x += w;
  });
  return new Code128Reader().decodeRow(0, row, new Map()).getText();
}

test("the pattern table is Code 128's: zxing's own table, value for value", () => {
  // zxing keeps its table as module counts per symbol; ours is the same widths as strings.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const theirs = ((Code128Reader as any).CODE_PATTERNS as ArrayLike<number>[]).map((p) => Array.from(p));
  assert.equal(PATTERNS.length, 107);
  for (let v = 0; v < 107; v++) assert.deepEqual([...PATTERNS[v]].map(Number), theirs[v], `value ${v}`);
});

test("the judge card's barcode decodes back to exactly 2990000000083", () => {
  assert.equal(decode(code128Widths(JUDGE_BARCODE)), "2990000000083");
});

test("odd and even lengths both round-trip, and a wrong bar doesn't pass as the right number", () => {
  for (const digits of ["12", "123", "2990000000076", "0123456789012"]) assert.equal(decode(code128Widths(digits)), digits);
  const widths = code128Widths(JUDGE_BARCODE);
  widths[8] += 1; // one bar a module wider: the checksum or the pattern match must reject it
  assert.throws(() => decode(widths));
});

test("the symbols: start C, digit pairs, code B for the last digit, checksum, stop", () => {
  // 105 + 29·1 + 90·2 + 0 + 0 + 0 + 8·6 + 100·7 + 19·8 = 1214; 1214 mod 103 = 81.
  assert.deepEqual(code128Values(JUDGE_BARCODE), [105, 29, 90, 0, 0, 0, 8, 100, 19, 81, 106]);
  assert.throws(() => code128Values("29900000000a3"));
});

test("the SVG holds one rect per bar and a white quiet zone either side", () => {
  const svg = code128Svg(JUDGE_BARCODE);
  const bars = code128Widths(JUDGE_BARCODE).filter((_, i) => i % 2 === 0).length;
  assert.equal(svg.match(/<rect x=/g)?.length, bars);
  assert.match(svg, /^<svg [^>]*viewBox="0 0 (\d+) 50"/);
  const modules = code128Widths(JUDGE_BARCODE).reduce((a, b) => a + b, 0);
  assert.match(svg, new RegExp(`viewBox="0 0 ${modules + 24} 50"`));
  assert.match(svg, /<rect x="12" /, "the first bar starts after 12 modules of quiet zone");
});

test("why the card keeps its sides clear: one dark line beside the bars and zxing can't read them", () => {
  // Found rendering the card (Nov 4): a box border 35 modules left of the bars failed the checksum.
  // The same bars with nothing beside them read, so the card's box has rules above and below only.
  const bars = code128Widths(JUDGE_BARCODE);
  assert.equal(decode(bars, 36), "2990000000083");
  assert.throws(() => decode([2, 34, ...bars], 12), "a 2-module line, then 34 modules of white, then the bars");
});
