import assert from "node:assert/strict";
import { test } from "node:test";

import { onlyUncheckedGaps, provenanceLine, uncheckedNote } from "./evidenceCopy";

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
