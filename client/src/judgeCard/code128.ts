// Code 128 for the judge card (Prof. Yoest's Oct 29 ask, docs/judge-card-plan.md). The shared judge
// barcode, 2990000000083, has a deliberately wrong GTIN check digit, so it can't be printed as an
// EAN-13 a decoder would accept. Code 128 carries its own checksum and the same 13 digits. The app's
// scanner reads it (zxing with no format hints), and Scan takes any 6–14 digits.
//
// Digits only: code set C packs two digits per symbol, and an odd last digit goes in code set B.

/** Bar and space widths, in modules, for symbol values 0–106 (103–105 are the starts, 106 the stop). */
export const PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START_C = 105;
const CODE_B = 100;
const STOP = 106;

/** The symbol values for a string of digits: start C, digit pairs, code B for an odd last digit, checksum, stop. */
export function code128Values(digits: string): number[] {
  if (!/^\d+$/.test(digits)) throw new Error(`Code 128 here encodes digits only, not ${JSON.stringify(digits)}`);
  const values = [START_C];
  const pairs = digits.length - (digits.length % 2);
  for (let i = 0; i < pairs; i += 2) values.push(Number(digits.slice(i, i + 2)));
  if (digits.length % 2 === 1) values.push(CODE_B, digits.charCodeAt(digits.length - 1) - 32);
  const checksum = values.reduce((sum, value, i) => sum + value * Math.max(i, 1), 0) % 103;
  return [...values, checksum, STOP];
}

/** Module widths, alternating bar and space, starting with a bar; no quiet zone. */
export function code128Widths(digits: string): number[] {
  return code128Values(digits).flatMap((value) => [...PATTERNS[value]].map(Number));
}

/**
 * An SVG of the barcode, with a quiet zone of `quiet` modules either side. Each module is one unit
 * wide in the viewBox, so the symbol scales sharp to any printed or on-screen size.
 */
export function code128Svg(digits: string, { height = 50, quiet = 12 } = {}): string {
  const widths = code128Widths(digits);
  const total = widths.reduce((a, b) => a + b, 0) + 2 * quiet;
  let x = quiet;
  const bars: string[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w}" height="${height}"/>`);
    x += w;
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" preserveAspectRatio="none" ` +
    `shape-rendering="crispEdges" role="img" aria-label="Barcode ${digits}">` +
    `<rect width="${total}" height="${height}" fill="#fff"/><g fill="#000">${bars.join("")}</g></svg>`
  );
}
