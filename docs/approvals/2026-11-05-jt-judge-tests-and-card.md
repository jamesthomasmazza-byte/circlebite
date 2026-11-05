# The test names and the judge card for his October 29 ask

**From:** JT (James Mazza) to Prof. Jack Yoest
**Date:** November 5, 2026 (exact time not recorded), with the judge card attached as a PDF
**Answers:** his October 29, 7:23 PM email (`2026-10-29-yoest-judge-tests-and-card.md`)

Reproduced from the draft reviewed on November 4, with the one change JT reported making before
sending: the line about the card's phone tests. JT didn't paste the sent copy. Line breaks inside
paragraphs are not kept. Indexed in `docs/approvals/conditions.md`.

**Where each claim is backed:**
- **The tests:** the files and test names it gives.
- **The phone test off a laptop screen:** `docs/journal.md`, 2026-11-04.
- **The bordered box:** `client/src/judgeCard/code128.test.ts`.
- **Still owed:** the paper scan it promises, and the two lines after the judging-week reseed.

---

> Prof. Yoest,
>
> Your October 29 ask, ahead of the November 13 freeze.
>
> The tests, in the public repository (github.com/jamesthomasmazza-byte/circlebite):
>
> Two judges reporting the same allergen on 2990000000083 each stay at one family:
> - server/src/db/seed/judgeSeed.test.ts, "a judge's own report on the shared barcode stays in their world; a real family still sees the real warning". Judges 1 and 2 each report peanut on 2990000000083. Each report stays pending in its own judge's world, counted as one family, and neither reaches judge 3 or a real family.
> - server/src/corrections/judgeWorldCorroboration.test.ts, "four judges reporting Sesame on the same barcode are four worlds of one family each — none is confirmed". The same rule for all four judges, on a test barcode, where without the separation the same four reports would count as four families.
>
> A judge's report on a real product never moves a real family's count (both on a non-demo barcode standing in for a real product):
> - server/src/corrections/judgeWorldCorroboration.test.ts, "a judge's report never counts toward a real claim, and isn't confirmed with it". A real family's count stays at one beside a judge's report, and when a second real family confirms, the judge's report is left out.
> - server/src/corrections/judgeWorldVisibility.test.ts, "a judge's confirmed Peanut on a real product leaves a real family's Peanut count at 2". Added this week: even with a judge's peanut report confirmed on the same product, a real family still sees 2, and other judges see only the real claim.
>
> The judge card is attached as one printable page: 2990000000083 as a barcode, the digits underneath, and a line for typing them into the Barcode field if a camera won't read it. It is also in the repository as docs/judges/judge-card.html. On my iPhone it scanned off a laptop screen. I haven't tested it off paper yet; it is a standard Code 128 barcode at full size, so it should read from a printout too, and I will confirm that before judging.
>
> One thing I learned building it. The shared number's check digit is deliberately invalid, so no real product can carry it, which means a standard retail barcode of it would be rejected. The card prints it as Code 128, which carries the same digits. My first version drew a box around the barcode, and before it reached a phone, a test of the rendered page failed: a dark line beside the bars made the decoder the app uses reject them. The box is now open at the sides, and a test, "why the card keeps its sides clear: one dark line beside the bars and zxing can't read them" (client/src/judgeCard/code128.test.ts), keeps it that way.
>
> The two lines confirming it held on production will follow the judging-week reseed.
>
> Best,
> James Mazza
