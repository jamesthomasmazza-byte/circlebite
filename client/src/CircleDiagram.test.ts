import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CircleDiagram, RING_MAX, type Bubble } from "./CircleDiagram";

// The redesigned Circle tab's picture (JT, 2026-11-06): decoration, initials only.

const render = (centerName: string, bubbles: Bubble[]) => renderToStaticMarkup(createElement(CircleDiagram, { centerName, bubbles }));

test("hidden from screen readers, and initials only: never a photo or a full name on the ring", () => {
  const html = render("Maya", [
    { key: "y", name: "You", kind: "you" },
    { key: "g", name: "Grandma Lou", kind: "member" },
    { key: "p", name: "", kind: "pending" },
  ]);
  assert.match(html, /<div class="circle-diagram" aria-hidden="true">/);
  assert.doesNotMatch(html, /<img|background-image/);
  assert.doesNotMatch(html, /Grandma Lou/);
  assert.match(html, /circle-diagram__bubble--you"[^>]*>You</);
  assert.match(html, /circle-diagram__bubble--member"[^>]*>GL</);
  assert.match(html, /circle-diagram__bubble--pending"[^>]*>\?</, "a waiting invite is a \"?\"");
  assert.match(html, /circle-diagram__initial">M<\/span><span class="circle-diagram__name">Maya</);
});

test("a full ring says how many more", () => {
  const many = Array.from({ length: RING_MAX + 3 }, (_, i): Bubble => ({ key: `m${i}`, name: `Person ${i}`, kind: "member" }));
  const html = render("Maya", many);
  assert.equal(html.match(/circle-diagram__bubble /g)?.length, RING_MAX);
  assert.match(html, />\+4</);
});
