import assert from "node:assert/strict";
import { test } from "node:test";

import { compareProductIdentity } from "./productIdentity.js";

/**
 * Fixtures below are built from the actual rows in this project's local `products` cache
 * (confirmed via `psql ... -c "SELECT barcode, name, brand, found FROM products"` on 2026-09-27),
 * not invented product names — the whole point of this comparison is surviving real Open Food
 * Facts naming, not tidy strings a test author made up.
 *
 * The cache has 5 rows. One (barcode 00000000000) is a genuine "not found" fetch — used below as
 * the real grounding for the null case. One (barcode 3000000000001, name "Test Crackers", brand
 * "Invented Co") is a dev fixture seeded during an earlier session, not a real Open Food Facts
 * fetch — excluded from the "real naming variety" fixtures below and not used to justify any
 * comparison decision, only noted here so it isn't mistaken for a fourth real data point.
 *
 * That leaves exactly THREE genuine Open Food Facts names to build real-world variance from:
 *   - 3017620422003  "Nutella"                                       brand "Nutella, Ferrero, Yum yum"
 *   - 0049000028911  "Diet Coke Soft Drink"                          brand "Coke"
 *   - 0050000350223  "Coffee Mate Coffee Creamer, French Vanilla"    brand "Nestlé (ahh brand)"
 *
 * A fourth real data point joined these later, from an actual production scan rather than the dev
 * products cache: barcode 046000287324, OFF name "Soft taco dinner kit imp", OFF brand "Old El
 * Paso" — see the brand-corroboration test below for why it's here.
 *
 * Three names is not enough to derive a numeric similarity threshold with any statistical
 * confidence, and compareProductIdentity.ts says so rather than pretending otherwise — what these
 * three DO give real evidence for is that OFF names already exhibit comma-separated multi-brand
 * lists, repeated brand words, and generic descriptor suffixes, which is enough to hand-verify that
 * the chosen rule (block only on zero shared significant words) survives that mess. The label side
 * of each pair below is a mechanical transformation of the real OFF name — case, punctuation, brand
 * prefixing, added size/count — not a fabricated new product, and each transformation is called out
 * so it's clear what was done to real data versus invented.
 */

test("Nutella, same product: label reads it in shouting caps, as printed on the jar", () => {
  // Mechanical transform of the real name: uppercased only.
  const result = compareProductIdentity("Nutella", null, "NUTELLA");
  assert.equal(result.matched, true);
});

test("Diet Coke Soft Drink, same product: label shows the shorter front-of-pack name plus real pack/size noise", () => {
  // Mechanical transform: OFF's generic "Soft Drink" suffix dropped, a count and unit and "CANS"
  // added — the kind of packaging text a label photo actually contains that a database record often
  // doesn't.
  const result = compareProductIdentity("Diet Coke Soft Drink", null, "DIET COKE 12 FL OZ CANS, 6 PK");
  assert.equal(result.matched, true);
});

test("Coffee Mate Coffee Creamer, French Vanilla — same product: label has a hyphenated, trademarked brand and reordered words", () => {
  // Mechanical transform: comma removed, hyphen inserted into the brand (real packaging style,
  // e.g. "COFFEE-MATE"), a trademark symbol added, word order changed.
  const result = compareProductIdentity(
    "Coffee Mate Coffee Creamer, French Vanilla",
    null,
    "COFFEE-MATE® FRENCH VANILLA CREAMER",
  );
  assert.equal(result.matched, true);
});

test("two of this project's real cached products, scanned against each other: a genuine mismatch, no invented strings", () => {
  // Not a transform — both sides are verbatim real OFF names for two different real barcodes.
  // This is what "photographed the wrong package" actually looks like.
  const result = compareProductIdentity("Nutella", null, "Diet Coke Soft Drink");
  assert.equal(result.matched, false);
});

test("not-found barcode (00000000000, a real row in this cache): no OFF name at all means nothing to compare, never a mismatch", () => {
  const result = compareProductIdentity(null, null, "Diet Coke Soft Drink");
  assert.equal(result.matched, null);
  assert.equal(result.note, null);
});

test("label extraction with no visible product name: also nothing to compare", () => {
  const result = compareProductIdentity("Nutella", null, null);
  assert.equal(result.matched, null);
});

test("illustrative only, not grounded in real cache data — size/count words alone must never manufacture a false match", () => {
  // This project's real cached names don't happen to include two different products sharing only a
  // size/count word, so this case is synthetic on purpose, unlike every test above it — it exists
  // to pin down the STOPWORDS behavior (numbers and packaging units are stripped before comparing),
  // not to claim evidence about real-world naming.
  const result = compareProductIdentity("Acme Peanuts 12 oz", null, "Zenith Almonds 12 oz");
  assert.equal(result.matched, false);
});

test("the one non-OFF row in this cache (a dev-seeded fixture, not a real fetch) still compares sanely on an exact match", () => {
  // barcode 3000000000001, name "Test Crackers", brand "Invented Co" — noted as synthetic, not used
  // to justify the comparison rule, but confirming it doesn't misbehave against it either.
  const result = compareProductIdentity("Test Crackers", null, "TEST CRACKERS");
  assert.equal(result.matched, true);
});

test("real regression, barcode 046000287324: a multi-component kit's OFF name shares no words with the label, but the brand does", () => {
  // The scan that surfaced this bug: OFF product_name is the component name off a dinner kit ("Soft
  // taco dinner kit imp"), the label photographed was the tortillas' own printed name with the
  // brand in parentheses. Zero shared words between the two names alone — this used to be a false
  // mismatch. Folding offBrand into the comparison is exactly the fix.
  const result = compareProductIdentity("Soft taco dinner kit imp", "Old El Paso", "Flour Tortillas (Old El Paso)");
  assert.equal(result.matched, true);
});
