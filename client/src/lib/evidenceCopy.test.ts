import assert from "node:assert/strict";
import { test } from "node:test";

import {
  historyUncheckedNote,
  onlyUncheckedGaps,
  photoOfferCopy,
  provenanceLine,
  uncheckedBasis,
  uncheckedNote,
} from "./evidenceCopy";

test("provenanceLine: a combined scan with no product record never claims the product database was checked", () => {
  // The 2026-09-28 live case (barcode 2113792886078): "Unknown product", then "Checked against the
  // product database and a photographed label".
  const line = provenanceLine({ source: "combined", evidence: "label_only" });
  assert.ok(line);
  assert.doesNotMatch(line!.heading + line!.detail, /product database/);
  assert.match(line!.detail!, /no product record was found/);
});

test("provenanceLine: a combined scan missing its evidence field claims less, not more", () => {
  const line = provenanceLine({ source: "combined", evidence: undefined });
  assert.doesNotMatch(line!.heading, /product database/);
});

test("provenanceLine: both sources named only when both existed", () => {
  const line = provenanceLine({ source: "combined", evidence: "barcode_and_label" });
  assert.equal(line!.heading, "Checked against the product database and a photographed label");
});

test("provenanceLine: a plain barcode scan has no provenance line", () => {
  assert.equal(provenanceLine({ source: "barcode", evidence: undefined }), null);
});

test("onlyUncheckedGaps: true only when unchecked is the whole story", () => {
  assert.equal(onlyUncheckedGaps([{ classification: "unchecked" }, { classification: "clear" }]), true);
  assert.equal(onlyUncheckedGaps([{ classification: "unchecked" }, { classification: "contains" }]), false);
  assert.equal(onlyUncheckedGaps([{ classification: "unchecked" }, { classification: "unresolved" }]), false);
  assert.equal(onlyUncheckedGaps([{ classification: "clear" }]), false);
});

test("uncheckedNote: leads with the limit when it stands in for the explanation", () => {
  const note = uncheckedNote({ names: ["milk", "egg"], profileLabel: "Sam", leadsCard: true });
  assert.equal(note, "Not confirmed — we couldn't check 2 of Sam's allergens against this photo: milk, egg.");
  assert.doesNotMatch(note, /\bsafe\b/i);
});

test("uncheckedNote: one allergen, no profile label, not leading", () => {
  assert.equal(
    uncheckedNote({ names: ["sesame"], profileLabel: null, leadsCard: false }),
    "We couldn't check 1 of your allergens against this photo: sesame.",
  );
});

test("photoOfferCopy: a Contains card on missing data offers the photo for the other allergens, not the warning", () => {
  // The 2026-10-05 seed case: a shopper report says Contains on a barcode no database has.
  const copy = photoOfferCopy({ photo: "prompted", reason: "missing_data" }, "Maya");
  assert.equal(copy, "The product data couldn't check the rest of Maya's allergens — a photo of the ingredients panel can.");
  assert.doesNotMatch(copy!, /severe|second opinion|confirm/);
});

test("photoOfferCopy: thin data reads the same, and falls back to 'your' without a label", () => {
  assert.match(photoOfferCopy({ photo: "prompted", reason: "thin_data" }, null)!, /rest of your allergens/);
});

test("photoOfferCopy: the severe-allergen second opinion keeps its own copy", () => {
  assert.match(photoOfferCopy({ photo: "prompted", reason: "severe_allergen" }, "Maya")!, /severe allergen on file/);
});

test("photoOfferCopy: nothing for a required photo or no decision", () => {
  assert.equal(photoOfferCopy({ photo: "required", reason: "missing_data" }, "Maya"), null);
  assert.equal(photoOfferCopy({ photo: "none" }, "Maya"), null);
  assert.equal(photoOfferCopy(null, "Maya"), null);
});

test("uncheckedNote: no product data says there was nothing to check against, never that it's fine", () => {
  // The 2026-10-05 seed card: Contains from a shopper report on peanut, sesame checked against nothing.
  const note = uncheckedNote({ names: ["sesame"], profileLabel: "Maya", leadsCard: false, basis: "no_product_data" });
  assert.equal(note, "We couldn't check 1 of Maya's allergens — there's no product data on file to check it against: sesame.");
  assert.doesNotMatch(note, /\bsafe\b|\bclear\b|\bphoto\b|not (found|listed|in)/i);
});

test("uncheckedNote: no product data, several allergens, leading the card", () => {
  assert.equal(
    uncheckedNote({ names: ["sesame", "milk"], profileLabel: null, leadsCard: true, basis: "no_product_data" }),
    "Not confirmed — we couldn't check 2 of your allergens — there's no product data on file to check them against: sesame, milk.",
  );
});

test("uncheckedBasis: no_product_data only when every unchecked allergen carries it", () => {
  assert.equal(uncheckedBasis([{ uncheckedBecause: "no_product_data" }]), "no_product_data");
  assert.equal(uncheckedBasis([{ uncheckedBecause: "no_product_data" }, {}]), "photo");
  assert.equal(uncheckedBasis([{}]), "photo");
  assert.equal(uncheckedBasis([]), "photo");
});

test("historyUncheckedNote: the photo wording is unchanged, and no product data never mentions a photo", () => {
  assert.equal(
    historyUncheckedNote(["milk", "egg"], "photo"),
    "Couldn't check 2 allergens against this photo: milk, egg. A photo isn't checked as thoroughly as a barcode — always check the package.",
  );
  const noData = historyUncheckedNote(["sesame"], "no_product_data");
  assert.equal(noData, "Couldn't check 1 allergen — there's no product data on file to check it against: sesame. Always check the package.");
  assert.doesNotMatch(noData, /photo|\bsafe\b/i);
});
