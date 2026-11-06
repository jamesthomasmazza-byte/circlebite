import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AddToCircleSheet } from "./AddToCircleSheet";

// "Add to <name>'s circle" (JT's mockup, 2026-11-06, behind CIRCLE_REDESIGN).

const SRC = readFileSync(new URL("./AddToCircleSheet.tsx", import.meta.url), "utf8");
const render = (is_self = false) =>
  renderToStaticMarkup(
    createElement(AddToCircleSheet, { profile: { id: "p", label: "Maya", is_self }, open: true, onClose: () => {}, onMade: () => {} }),
  );

test("titled for the profile, with three choices and none chosen", () => {
  const html = render();
  assert.match(html, /<h2 id="add-sheet-title">Add to Maya&#x27;s circle<\/h2>/);
  assert.match(html, /<legend>What should they be able to do\?<\/legend>/);
  assert.equal(html.match(/<input type="radio" name="add-choice"/g)?.length, 3);
  assert.doesNotMatch(html, /checked=""/, "no default access level");
  assert.match(html, /See all allergens[\s\S]*See severe allergens only[\s\S]*Help manage the profile/);
  assert.match(html, /<button type="button" class="button-primary" disabled="">Create invite link<\/button>/, "nothing is made until a choice");
  assert.match(render(true), /Add to your circle/);
});

test("the link comes from the same endpoints as today's tab: a co-manager by invite link only", () => {
  assert.match(SRC, /choice === "co_manager" \? await createManagerInvite\(profile\.id\) : await createFollowInvite\(profile\.id, \{ shareLevel: choice \}\)/);
  assert.match(SRC, /<fieldset className="choice-cards" disabled=\{url !== null\}>/, "the choice locks once a link exists");
});

test("Share uses the phone's share sheet where there is one, else copies; Copy link copies the link", () => {
  assert.match(SRC, /if \(typeof navigator\.share === "function"\)/);
  assert.match(SRC, /await navigator\.share\(\{ text \}\);/);
  assert.match(SRC, /onClick=\{\(\) => void share\(message\)\}/);
  assert.match(SRC, /onClick=\{\(\) => void copy\(url!\)\}/);
  assert.match(SRC, /\{LINK_FOOTNOTE\}/);
});
