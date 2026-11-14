import assert from "node:assert/strict";
import { test } from "node:test";

import { amazonProductUrl, asinFromAmazonLink } from "./amazonLink.js";

// "Link on Amazon" keeps only the ASIN (docs/snack-list-plan.md addendum part B, 2026-11-14).

test("/dp/<ASIN> and /gp/product/<ASIN> on amazon.com, with or without a title, a query, a fragment or a trailing slash", () => {
  for (const url of [
    "https://www.amazon.com/dp/B07PGL2ZSL",
    "https://www.amazon.com/dp/B07PGL2ZSL/",
    "https://www.amazon.com/dp/B07PGL2ZSL?th=1&psc=1",
    "https://www.amazon.com/dp/B07PGL2ZSL#customerReviews",
    "https://www.amazon.com/Hearthfield-Plain-Rice-Crackers/dp/B07PGL2ZSL/ref=sr_1_1?keywords=crackers",
    "https://www.amazon.com/gp/product/B07PGL2ZSL",
    "https://www.amazon.com/gp/product/B07PGL2ZSL/ref=ox_sc_act_title_1",
    "https://amazon.com/dp/B07PGL2ZSL",
    "https://smile.amazon.com/dp/B07PGL2ZSL",
    "http://www.amazon.com/dp/B07PGL2ZSL",
    "  https://www.amazon.com/dp/b07pgl2zsl  ",
  ]) {
    assert.equal(asinFromAmazonLink(url), "B07PGL2ZSL", url);
  }
});

test("anything else is null: short links, other hosts, a search page, a cart page, the wrong shape, not a URL", () => {
  for (const url of [
    "https://a.co/d/0abcdefg",
    "https://amzn.to/3abcdef",
    "https://amzn.com/B07PGL2ZSL",
    "https://www.amazon.co.uk/dp/B07PGL2ZSL",
    "https://www.amazon.com.evil.example/dp/B07PGL2ZSL",
    "https://notamazon.com/dp/B07PGL2ZSL",
    "https://www.amazon.com/s?k=rice+crackers",
    "https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B07PGL2ZSL",
    "https://www.amazon.com/dp/B07PGL2ZS",
    "https://www.amazon.com/dp/B07PGL2ZSLX",
    "https://www.amazon.com/dp/B07PGL2Z-L",
    "https://www.amazon.com/product/B07PGL2ZSL",
    "ftp://www.amazon.com/dp/B07PGL2ZSL",
    "B07PGL2ZSL",
    "www.amazon.com/dp/B07PGL2ZSL",
    "",
    "   ",
    `https://www.amazon.com/${"x".repeat(2100)}/dp/B07PGL2ZSL`,
  ]) {
    assert.equal(asinFromAmazonLink(url), null, url.slice(0, 60));
  }
  assert.equal(asinFromAmazonLink(undefined), null);
  assert.equal(asinFromAmazonLink(42), null);
  assert.equal(asinFromAmazonLink({ url: "https://www.amazon.com/dp/B07PGL2ZSL" }), null);
});

test("the product page for a stored ASIN carries the Associates tag only when set", () => {
  assert.equal(amazonProductUrl("B07PGL2ZSL"), "https://www.amazon.com/dp/B07PGL2ZSL");
  assert.equal(amazonProductUrl("B07PGL2ZSL", { amazonAssociateTag: "" }), "https://www.amazon.com/dp/B07PGL2ZSL");
  assert.equal(amazonProductUrl("B07PGL2ZSL", { amazonAssociateTag: "circlebite-20" }), "https://www.amazon.com/dp/B07PGL2ZSL?tag=circlebite-20");
});
