// The one-page judge card (Prof. Yoest's Oct 29 ask, docs/judge-card-plan.md §3; reordered for his
// Nov 5 asks): the judge link first, then an optional "See the scan yourself" with the shared judge
// barcode as a printed Code 128, its digits underneath, the typed-entry fallback, and what each
// profile should show; then the butter spread case. No logins: the link replaced them. One self-contained HTML page: inline SVG, system fonts, no external request.
// Written by scripts/judge-card.ts to docs/judges/judge-card.html; print it to PDF from a browser.

import { code128Svg } from "./code128";

/** The seed's shared barcode (server/src/db/seed/seedData.ts, PRODUCTS.circleReported). */
export const JUDGE_BARCODE = "2990000000083";

/** What each card says, word for word from JUDGES.md's reporter row, which a test keeps in step. */
export const MAYA_LINE =
  "Priya Nair (co-manager) reported Sesame present and photographed the label. No other family has confirmed it yet.";
export const NOOR_LINE =
  "A co-manager in Noor's circle reported Wheat present and photographed the label. No other family has confirmed it yet.";

/** The real butter spread case (docs/journal.md, 2026-11-03; Prof. Yoest asked for it on the card, Nov 5). */
export const BUTTER_SPREAD_LINES = [
  "One real case from testing. Two test accounts, both belonging to the developer, reported sesame in a real Icelandic butter spread. Its ingredients have no sesame. The app counted the two accounts as two families, so the warning was confirmed for everyone. It was removed by hand on November 3.",
  "It also shows the safeguard working as designed: two accounts from one person could only add a warning, never clear one. A report that an allergen isn't there is noted on the reporter's own card and never applied, so the same trick can't remove a real warning.",
];

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
  .start { margin: 0 0 8px; padding: 12px 14px; border: 2px solid #15171c; border-radius: 8px; }
  .start p { margin: 4px 0; }
  .optional { margin-top: 24px; }
  .case p { margin: 6px 0; }
  .fine { margin-top: 20px; font-size: 14px; }
  /* One printed page: tighter type and spacing on paper only. The barcode keeps its width. */
  @media print {
    body { font-size: 13.5px; line-height: 1.35; }
    main { padding: 0; }
    h1 { font-size: 22px; }
    h2 { font-size: 16px; margin: 14px 0 4px; }
    .start { padding: 8px 12px; }
    .optional { margin-top: 14px; }
    .lead { margin-bottom: 10px; }
    .code { padding: 12px 0 8px; }
    .code svg { height: 1.2in; }
    .digits { font-size: 28px; margin-top: 6px; }
    li, .expect p, .case p { margin: 3px 0; }
    .fine { margin-top: 12px; font-size: 12px; }
  }
</style>
</head>
<body>
<main>
  <h1>CircleBite judge card</h1>

  <div class="start">
    <h2>Start here: click your judge link</h2>
    <p>Prof. Yoest sends one link for every judge. Click it: CircleBite opens already signed in to a demo judge account, on Maya's result for <strong>${JUDGE_BARCODE}</strong>. There is nothing to type and no password.</p>
    <p>Each judge's demo family is kept apart in the data: a report you file never counts toward another judge's, or toward a real family's.</p>
  </div>

  <section class="optional">
  <h2>Optional: see the scan yourself</h2>
  <p class="lead">Scanning is the heart of the app. Scan this barcode off this page or off a laptop screen, after opening the link.</p>

  <div class="code">
    ${code128Svg(JUDGE_BARCODE)}
    <p class="digits">${JUDGE_BARCODE}</p>
  </div>

  <ol>
    <li>Tap <strong>Scan</strong>, choose <strong>Maya</strong> first, then tap <strong>Scan with camera</strong> and hold this barcode inside the box.</li>
    <li>Camera won't read it? Tap <strong>Type it</strong> if you see it, then type <strong>${JUDGE_BARCODE}</strong> in <strong>Barcode</strong> and tap <strong>Check this product</strong>.</li>
    <li>Then choose <strong>Noor</strong> and scan it again.</li>
  </ol>

  <h2>What you should see</h2>
  <div class="expect">
    <p><strong>Maya</strong> (you own her profile): <strong>Contains an allergen</strong>.<span class="quote">“${MAYA_LINE}”</span></p>
    <p><strong>Noor</strong> (you follow her): <strong>Contains an allergen</strong>.<span class="quote">“${NOOR_LINE}”</span></p>
  </div>
  </section>

  <h2>Why one person can't clear a warning</h2>
  <div class="case">
    ${BUTTER_SPREAD_LINES.map((line) => `<p>${line}</p>`).join("\n    ")}
  </div>

  <p class="fine">Every product, family and report in the demo accounts is invented; the butter spread above is the one real case, from the developer's own testing. The full guide is <strong>JUDGES.md</strong> in the project's GitHub repository.</p>
</main>
</body>
</html>
`;
}
