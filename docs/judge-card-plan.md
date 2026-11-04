# Prof. Yoest's October 29 ask: the tests, the judge card, and the confirmation

Plan, November 4, 2026. Nothing here is built yet. His email:
`docs/approvals/2026-10-29-yoest-judge-tests-and-card.md`. Due by the November 13 code freeze,
except the confirmation, which comes after a reseed.

## 1. The tests he asked for

### (a) Two judges reporting the same allergen on 2990000000083 each stay at one family

**Exists:**
- **`server/src/db/seed/judgeSeed.test.ts`, "a judge's own report on the shared barcode stays in
  their world; a real family still sees the real warning".** Judges 1 and 2 each report Peanut on
  their own Maya's seeded scan of `2990000000083`. It checks that:
  - each report is pending and not corroborated;
  - each is stamped with its own judge's world;
  - judge 3 sees neither report;
  - a real peanut-allergic family sees nothing from any judge.
- **`server/src/corrections/judgeWorldCorroboration.test.ts`, "four judges reporting Sesame on the
  same barcode are four worlds of one family each — none is confirmed".** It checks
  `countCorroboratingFamilies` = 1 for each judge, and none confirmed. Without the worlds, the same
  rows would be three families. It runs on `4900000000083`, not the shared barcode, on purpose
  (`ac94aa9`): a local database holding the seed would add its own rows to the count.

**To add or fix:**
- **The seed test proves "one family" only through status** (pending, not corroborated). Add
  `countCorroboratingFamilies(...) === 1` for each judge's report on `2990000000083`, so the test
  states his exact claim.
- **The corroboration test's name says "four judges", but it reports from three** (only `JUDGE_1`
  to `JUDGE_3` exist in the file). Either add a fourth judge, or rename it to "three". Adding the
  fourth is better: four is how many judges there are.

### (b) A judge's report on a real product never moves a real family's count

**Exists:**
- **`judgeWorldCorroboration.test.ts`, "a judge's report never counts toward a real claim, and
  isn't confirmed with it".** It runs on `4900000000083`, which stands for a real product (not a
  seed barcode). It checks that:
  - the real family's count stays 1 beside a judge's report;
  - two real families confirm as always;
  - the judge's report is left pending.
- **`judgeWorldVisibility.test.ts`, "a judge's confirmed warning never reaches a real family; a
  real one reaches every judge".** A real family sees `{ Peanut: 2 }` while judge 1's world has a
  confirmed Sesame.

**To add:** the same-allergen case. Today the visibility test uses Peanut for the real family and
Sesame for the judge, so nothing shows that a judge's confirmed **Peanut** on the same real product
leaves the real family's count at 2. New test in `judgeWorldVisibility.test.ts`: real families 1
and 2 confirm Peanut, and judge 1 and Priya 1 confirm Peanut. Then:
- a real family sees `{ Peanut: 2 }`;
- judge 2 sees `{ Peanut: 2 }`;
- judge 1 sees one Peanut claim.

**Sent to him:** the file and test names above, after the additions pass.

## 2. JUDGES.md

Already shows the single barcode: `f256065` (October 29) puts `2990000000083` in the reporter row
for every judge. The only change is a line pointing to the card.

## 3. The one-page judge card

### The problem with the barcode as it is

Every seed barcode has a deliberately wrong GTIN check digit (`judgeSeed.test.ts`, "every seed
barcode is a GTIN-13 with a deliberately invalid check digit — no real product can carry it").
`2990000000083` would need an `8`. An EAN-13 decoder checks that digit, so a printed EAN-13 of it
won't scan.

### Recommended: print it as Code 128, and change nothing else

- **Code 128 has its own checksum, independent of the GTIN one.** It can carry the 13 digits
  exactly as they are.
- **The scanner already reads it, by every sign in the code.** `BarcodeScanner.tsx` uses zxing's
  `BrowserMultiFormatReader` with no format hints. With no hints, zxing's 1D reader tries every
  format it has, Code 128 among them.
- **Nothing downstream checks the format or check digit.** The decoded text goes to Scan, which
  requires only 6–14 digits (`Scan.tsx`), as does the server (`scans.ts`, `BARCODE_PATTERN`).

Nothing changes in the seed, the judge worlds, `JUDGES.md`, the tests, §8's check (which uses
`…076`), or what Prof. Yoest wrote: he named `2990000000083`, and the card carries exactly that.

**Prove it before building the card:**
1. **A unit test that encodes and decodes.** Encode `2990000000083` with the card's own Code 128
   generator, then decode the bars with `@zxing/library`'s `Code128Reader`, already a client
   dependency, as a row of bars, with no image or camera. It must read back `2990000000083`.
2. **A phone test, with `SCANNER_REGION` on** (as production runs it):
   - the card on paper;
   - the card on a laptop screen at normal brightness;
   - each as an iPhone and, if one can be borrowed, an Android phone.
   Pass: "Got it", then the Maya card the `JUDGES.md` row describes.

### The card

- **A script in the repo, `scripts/judge-card.ts`.** It writes a self-contained
  `docs/judges/judge-card.html`: inline SVG, no web fonts, no external requests, no service.
  Print it to PDF from any browser. The Code 128 encoder is ours, about 100 lines with its own
  tests; there's no new dependency.
- **On the page:**
  - the barcode, large, with quiet zones of at least 10 modules either side, sized to scan from a
    phone held 15–25 cm away;
  - the digits underneath, `2990000000083`, large, in a monospace face. *Built ungrouped: spaces
    typed into the Barcode field would fail its digits-only check.*
  - **typed entry:** "Camera won't read it? On Scan, type `2990000000083` in **Barcode** and tap
    **Check this product**." (These are the app's own labels.)
  - which profile to choose first (**Maya**, then **Noor**), and one line each on what the card
    should show, taken from the `JUDGES.md` row;
  - "Every product and family here is invented."
- **Where it lives:** linked from `JUDGES.md` and sent with the credentials. A judge can scan it off
  paper, or off a laptop screen while the phone runs the app.

**Built November 4** (`ffa7053`, `3afd9fa`). One change from this plan: the barcode's box has
rules above and below only. Rendered with a full border, the card didn't decode: zxing failed the
checksum with a dark line beside the bars, even 60 modules away. Without it, a screenshot of the
card decodes to `2990000000083` with zxing set up as the app sets it up. `code128.test.ts` pins
both. **JT's phone test, off paper and off a laptop screen, is still to do.**

**Size:** about half a day, with the tests. **Risk:** low. Nothing in the app or the data changes,
only a new script, its tests, and one generated page.

### Fallback, only if Code 128 fails on a phone: a valid EAN-13

Switch the shared barcode to the valid-check-digit `2990000000088`. Before doing so:
- **The 2 prefix.** GS1 reserves prefixes 20–29 for restricted circulation (in-store and
  company-internal numbers). Confirm against the GS1 General Specifications before relying on it.
- **Collisions.** The other seed codes are `…014` to `…076`, so none is `…088`.
- **Real in-store codes.** A restricted-circulation code can be used by any store for its own
  items. The seed's product row never refreshes from Open Food Facts, so a shopper whose store
  happens to use `2990000000088` would get the demo product. Search Open Food Facts for it first.
- **It moves away from what he wrote.** He asked for `2990000000083` by name, so the change would
  need telling him.

What changes:
- `seedData.ts`: `PRODUCTS.circleReported.barcode`, and `…083` added to `RETIRED_SEED_BARCODES`, so a
  reseed deletes the old cache row it wrote.
- The "every seed barcode is … deliberately invalid" test needs a named exception.
- The `JUDGES.md` row.
- Every doc and approval-index line that names `…083` (new lines only; saved emails stay as sent).
- A reseed.

Judge worlds and corroboration need no change: they key on the world, not the barcode. **Size:**
about a day. **Risk:** medium, because it touches the seed and the demo every judge uses, a week
before judging.

## 4. Two lines confirming it held on production

**After a reseed.** The November 3 plain reseed already ran the world-setting seed. The
judging-week `--rotate-passwords` reseed is the one he names. Checked by JT, read-only and in the
app:
- **Worlds:** `SELECT judge_world, count(*) FROM users WHERE email LIKE '%@demo.circlebite.test' GROUP BY 1 ORDER BY 1;`
  Expect 4 in each of worlds 1–4, and 3 with none (the two reporting families and `deploy.check`).
- **The barcode:**
  - as judge1, then judge2, scan `2990000000083` on Maya and on Noor. Each shows only their own
    circle's report, "not yet confirmed by a second family";
  - `SELECT judge_world_at_report, status, count(*) FROM product_corrections WHERE barcode = '2990000000083' GROUP BY 1, 2;`
    should show one pending row per report, in each judge's own world, and none corroborated.
- **The false-safety check (§8)** as `deploy.check`.

**The two lines, drafted to fill in:** "After the [date] reseed, every judge account and its circle
is in its own world on production, and the shared barcode shows each judge only their own circle's
reports, none confirmed. A real family's two-family warning on `…076` still reaches every account."
