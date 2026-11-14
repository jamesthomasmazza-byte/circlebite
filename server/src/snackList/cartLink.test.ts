import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCartLink, CART_ADD_URL } from "./cartLink.js";

// The Amazon add-to-cart link (docs/snack-list-plan.md addendum part B, 2026-11-14).

test("ASIN.n and Quantity.n, numbered from 1 in the order given, on Amazon's add-to-cart form", () => {
  assert.equal(
    buildCartLink(["B07PGL2ZSL", "B000000001"]),
    `${CART_ADD_URL}?ASIN.1=B07PGL2ZSL&Quantity.1=1&ASIN.2=B000000001&Quantity.2=1`,
  );
  assert.equal(buildCartLink(["B07PGL2ZSL"]), `${CART_ADD_URL}?ASIN.1=B07PGL2ZSL&Quantity.1=1`);
});

test("the Associates tag only when set, as AssociateTag", () => {
  assert.equal(buildCartLink(["B07PGL2ZSL"], { amazonAssociateTag: "circlebite-20" }), `${CART_ADD_URL}?ASIN.1=B07PGL2ZSL&Quantity.1=1&AssociateTag=circlebite-20`);
  assert.doesNotMatch(buildCartLink(["B07PGL2ZSL"], { amazonAssociateTag: "  " })!, /AssociateTag/);
});

test("no ASINs is no link", () => {
  assert.equal(buildCartLink([]), null);
});
