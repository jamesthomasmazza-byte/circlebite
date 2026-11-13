import assert from "node:assert/strict";
import { test } from "node:test";

import { buildShopLinks, shopQuery } from "./shopLinks.js";

const cheerios = { barcode: "0016000275287", name: "Honey Nut Cheerios", brand: "General Mills" };

test("the query is name and brand when the record has a name", () => {
  assert.equal(shopQuery(cheerios), "Honey Nut Cheerios General Mills");
});

test("the brand isn't repeated when the name already carries it", () => {
  assert.equal(shopQuery({ barcode: "1", name: "Cheerios Honey Nut Cheerios", brand: "Cheerios" }), "Cheerios Honey Nut Cheerios");
  assert.equal(shopQuery({ barcode: "1", name: "Kate's Butter", brand: "kate's" }), "Kate's Butter");
});

test("the query falls back to the barcode only when there is no name", () => {
  assert.equal(shopQuery({ barcode: "0085582012740", name: null, brand: "Jayhawk" }), "0085582012740");
  assert.equal(shopQuery({ barcode: "0085582012740", name: "   ", brand: null }), "0085582012740");
});

test("both stores get a plain search link, URL-encoded", () => {
  const links = buildShopLinks(cheerios);
  assert.equal(links.amazon, "https://www.amazon.com/s?k=Honey%20Nut%20Cheerios%20General%20Mills");
  assert.equal(links.instacart, "https://www.instacart.com/store/s?k=Honey%20Nut%20Cheerios%20General%20Mills");
  assert.equal(links.affiliate, false);
});

test("no tag means no tag parameter: blank and whitespace count as unset", () => {
  for (const tag of [undefined, "", "   "]) {
    const links = buildShopLinks(cheerios, { amazonAssociateTag: tag });
    assert.ok(!links.amazon.includes("tag="), `unexpected tag for ${JSON.stringify(tag)}`);
    assert.equal(links.affiliate, false);
  }
});

test("the Amazon Associates tag is appended only to the Amazon link, and flags the disclosure", () => {
  const links = buildShopLinks(cheerios, { amazonAssociateTag: "circlebite-20" });
  assert.equal(links.amazon, "https://www.amazon.com/s?k=Honey%20Nut%20Cheerios%20General%20Mills&tag=circlebite-20");
  assert.ok(!links.instacart.includes("tag="));
  assert.equal(links.affiliate, true);
});

test("a name with characters that matter in a URL is encoded", () => {
  const links = buildShopLinks({ barcode: "1", name: "Chips & Dip #1 50% less", brand: null });
  assert.equal(links.amazon, "https://www.amazon.com/s?k=Chips%20%26%20Dip%20%231%2050%25%20less");
});
