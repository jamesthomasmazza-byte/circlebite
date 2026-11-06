// The one-page judge card (Prof. Yoest's Oct 29 ask, docs/judge-card-plan.md §3): the shared judge
// barcode as a printed Code 128, its digits underneath, the typed-entry fallback, and what each
// profile should show. One self-contained HTML page: inline SVG, system fonts, no external request.
// Written by scripts/judge-card.ts to docs/judges/judge-card.html; print it to PDF from a browser.

import { code128Svg } from "./code128";

/** The seed's shared barcode (server/src/db/seed/seedData.ts, PRODUCTS.circleReported). */
export const JUDGE_BARCODE = "2990000000083";

/** What each card says, word for word from JUDGES.md's reporter row, which a test keeps in step. */
export const MAYA_LINE =
  "Priya Nair (co-manager) reported Sesame present and photographed the label. No other family has confirmed it yet.";
export const NOOR_LINE =
  "A co-manager in Noor's circle reported Wheat present and photographed the label. No other family has confirmed it yet.";

export function renderJudgeCard(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CircleBite judge card</title>
<style>
  @page { size: letter; margin: 0.6in; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: #15171c; font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  main { max-width: 7.2in; margin: 0 auto; padding: 24px 16px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .lead { margin: 0 0 20px; }
  /* Rules above and below only. A dark line beside the bars, even well outside the quiet zone, made
     zxing (the app's own decoder) fail the checksum on this card: code128.test.ts shows it. */
  .code { border-top: 2px solid #15171c; border-bottom: 2px solid #15171c; padding: 20px 0 14px; text-align: center; break-inside: avoid; }
  .code svg { display: block; width: 100%; max-width: 5.2in; height: 1.5in; margin: 0 auto; }
  .digits { margin: 10px 0 0; font: 700 34px/1.2 ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: 0.12em; }
  h2 { font-size: 18px; margin: 22px 0 6px; }
  ol { margin: 0; padding-left: 22px; }
  li { margin: 4px 0; }
  .expect p { margin: 6px 0; }
  .quote { display: block; margin-top: 2px; }
  .fine { margin-top: 20px; font-size: 14px; }
</style>
</head>
<body>
<main>
  <h1>CircleBite judge card</h1>
  <p class="lead">One barcode for every judge. Scan it off this page or off a laptop screen.</p>

  <div class="code">
    ${code128Svg(JUDGE_BARCODE)}
    <p class="digits">${JUDGE_BARCODE}</p>
  </div>

  <h2>Scan it</h2>
  <ol>
    <li>Sign in at <strong>circlebite.app</strong> with the login from your one-time link.</li>
    <li>On <strong>Scan</strong>, choose <strong>Maya</strong> first, then tap <strong>Scan with camera</strong> and hold this barcode inside the box.</li>
    <li>Camera won't read it? Tap <strong>Type it</strong> if you see it, then type <strong>${JUDGE_BARCODE}</strong> in <strong>Barcode</strong> and tap <strong>Check this product</strong>.</li>
    <li>Then choose <strong>Noor</strong> and scan it again.</li>
  </ol>

  <h2>What you should see</h2>
  <div class="expect">
    <p><strong>Maya</strong> (you own her profile): <strong>Contains an allergen</strong>.<span class="quote">“${MAYA_LINE}”</span></p>
    <p><strong>Noor</strong> (you follow her): <strong>Contains an allergen</strong>.<span class="quote">“${NOOR_LINE}”</span></p>
  </div>

  <p class="fine">Every judge scans this same barcode and sees only their own circle's reports. Every product, family and report in this demo is invented. The full guide is <strong>JUDGES.md</strong> in the project's GitHub repository.</p>
</main>
</body>
</html>
`;
}
