import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BottomSheet } from "./BottomSheet";

const render = (open: boolean) =>
  renderToStaticMarkup(
    createElement(BottomSheet, { open, onClose: () => {}, labelledBy: "t", children: createElement("h2", { id: "t" }, "Title") }),
  );

test("a native dialog, named by its heading, with a Close button", () => {
  const html = render(true);
  assert.match(html, /^<dialog class="bottom-sheet" aria-labelledby="t">/);
  assert.match(html, /<button type="button">Close<\/button>/);
  assert.match(html, /<h2 id="t">Title<\/h2>/);
});

test("closed, its content isn't rendered at all", () => {
  assert.doesNotMatch(render(false), /Title/);
});

test("opened modally, so focus stays inside and Escape closes it", () => {
  const src = readFileSync(new URL("./BottomSheet.tsx", import.meta.url), "utf8");
  assert.match(src, /if \(open && !dialog\.open\) dialog\.showModal\(\);/);
  assert.match(src, /onClose=\{onClose\}/);
});
