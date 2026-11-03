# Design references

## `landing-mockup.html`

**What it is:** a design mockup of the signed-out landing page, made by JT in Claude's design canvas
as a visual reference. It is not app code and nothing in the app loads it. The custom tags (`<x-dc>`,
`<helmet>`) and the `./support.js` it points to belong to the canvas's export format, and
`support.js` was never in this repository, so the file won't render here as it did in the canvas.
Opened directly, it requests Public Sans from Google Fonts. The app does not: its fonts are
self-hosted (`client/src/fonts/README.md`).

**How it was used:** the landing page (`client/src/routes/Landing.tsx`, `358898e`) was rebuilt from
it by hand in the app's own React and CSS. What carried over:
- the copy, approved by JT word for word, after its claims were checked against the code
  (`docs/journal.md`, 2026-10-30);
- the layout and section order;
- two simple SVG shapes: the scanner's corner brackets and the lines joining the circle's people.

The pictured result cards were not copied from the mockup. They use the real verdict card's markup
and copy functions.

**Changes since:** the app has dropped "Accounts are for adults." (2026-11-03, `docs/coppa.md` §2.1:
no hint about age before the date-of-birth gate). The mockup is left as it was approved.

**Third-party content:** the warning-triangle icon in the mockup is Feather's `alert-triangle`
path, rounded to one decimal place. It appears in the mockup only, not in the app. Feather is
MIT-licensed; its notice, from https://github.com/feathericons/feather/blob/main/LICENSE:

```
The MIT License (MIT)

Copyright (c) 2013-2023 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
