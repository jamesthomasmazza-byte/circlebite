import assert from "node:assert/strict";
import { test } from "node:test";

import type { MergedAllergenDetail, MergedClassification } from "./mergeVerdict.js";
import { reconcileEvidence } from "./reconcileEvidence.js";

function mad(classification: MergedClassification, overrides: Partial<MergedAllergenDetail> = {}): MergedAllergenDetail {
  return {
    allergenName: "Milk",
    matched: false,
    source: null,
    severity: "severe",
    classification,
    aiEscalated: false,
    ...overrides,
  };
}

test("barcode missing entirely: the label's own finding passes through unchanged", () => {
  const label = mad("unchecked");
  const { matchedAllergens } = reconcileEvidence([], [label]);
  assert.deepEqual(matchedAllergens, [{ ...label, evidenceSource: "label" }]);
});

test("barcode clear, label silent: agreement, no disagreement flagged", () => {
  const barcode = mad("clear");
  const { matchedAllergens } = reconcileEvidence([barcode], [mad("unchecked")]);
  assert.equal(matchedAllergens[0].classification, "clear");
  assert.equal(matchedAllergens[0].evidenceSource, "barcode");
  assert.equal(matchedAllergens[0].disagreement, undefined);
});

test("barcode clear, label unresolved: escalates to unresolved, not flagged as a disagreement", () => {
  const label = mad("unresolved", { reason: "ambiguous additive code" });
  const { matchedAllergens } = reconcileEvidence([mad("clear")], [label]);
  assert.equal(matchedAllergens[0].classification, "unresolved");
  assert.equal(matchedAllergens[0].evidenceSource, "label");
  assert.equal(matchedAllergens[0].disagreement, undefined);
});

test("barcode clear, label contains: label_stricter — the label found what the database didn't", () => {
  const barcode = mad("clear");
  const label = mad("contains", { aiEscalated: true, citedSpan: "whey", reason: "whey is a milk derivative" });
  const { matchedAllergens } = reconcileEvidence([barcode], [label]);
  assert.equal(matchedAllergens[0].classification, "contains");
  assert.equal(matchedAllergens[0].evidenceSource, "label");
  assert.equal(matchedAllergens[0].disagreement, "label_stricter");
  assert.deepEqual(matchedAllergens[0].otherSource, barcode);
  assert.equal(matchedAllergens[0].citedSpan, "whey");
});

test("barcode unresolved, label silent: barcode's own uncertainty stands", () => {
  const barcode = mad("unresolved", { reason: "unrecognized additive" });
  const { matchedAllergens } = reconcileEvidence([barcode], [mad("unchecked")]);
  assert.equal(matchedAllergens[0].classification, "unresolved");
  assert.equal(matchedAllergens[0].evidenceSource, "barcode");
  assert.equal(matchedAllergens[0].disagreement, undefined);
});

test("barcode unresolved, label contains: label resolves the ambiguity, no disagreement badge", () => {
  const label = mad("contains", { aiEscalated: true, citedSpan: "casein" });
  const { matchedAllergens } = reconcileEvidence([mad("unresolved")], [label]);
  assert.equal(matchedAllergens[0].classification, "contains");
  assert.equal(matchedAllergens[0].evidenceSource, "label");
  assert.equal(matchedAllergens[0].disagreement, undefined);
});

test("barcode contains, label silent: label_looser — classification is UNCHANGED, never weakened", () => {
  const barcode = mad("contains", { matched: true, source: "tag" });
  const label = mad("unchecked");
  const { matchedAllergens } = reconcileEvidence([barcode], [label]);
  assert.equal(matchedAllergens[0].classification, "contains");
  assert.equal(matchedAllergens[0].evidenceSource, "barcode");
  assert.equal(matchedAllergens[0].disagreement, "label_looser");
  assert.deepEqual(matchedAllergens[0].otherSource, label);
});

test("barcode caution, label silent: label_looser applies the same way to a trace-level finding", () => {
  const barcode = mad("caution", { matched: true, source: "trace" });
  const { matchedAllergens } = reconcileEvidence([barcode], [mad("unchecked")]);
  assert.equal(matchedAllergens[0].classification, "caution");
  assert.equal(matchedAllergens[0].disagreement, "label_looser");
});

test("barcode contains, label unresolved: barcode's decided finding is not disturbed by label ambiguity", () => {
  const barcode = mad("contains", { matched: true, source: "ingredients" });
  const { matchedAllergens } = reconcileEvidence([barcode], [mad("unresolved")]);
  assert.equal(matchedAllergens[0].classification, "contains");
  assert.equal(matchedAllergens[0].evidenceSource, "barcode");
  assert.equal(matchedAllergens[0].disagreement, undefined);
});

test("barcode caution, label contains: label_stricter — the label's claim is more severe", () => {
  const barcode = mad("caution", { matched: true, source: "trace" });
  const label = mad("contains", { aiEscalated: true, citedSpan: "milk powder" });
  const { matchedAllergens } = reconcileEvidence([barcode], [label]);
  assert.equal(matchedAllergens[0].classification, "contains");
  assert.equal(matchedAllergens[0].evidenceSource, "label");
  assert.equal(matchedAllergens[0].disagreement, "label_stricter");
});

test("barcode contains, label caution: not a disagreement — the label corroborates at a lesser severity", () => {
  const barcode = mad("contains", { matched: true, source: "tag" });
  const { matchedAllergens } = reconcileEvidence([barcode], [mad("caution", { aiEscalated: true })]);
  assert.equal(matchedAllergens[0].classification, "contains");
  assert.equal(matchedAllergens[0].evidenceSource, "barcode");
  assert.equal(matchedAllergens[0].disagreement, undefined);
});

test("both sides agree exactly (contains/contains, caution/caution): no disagreement", () => {
  const contains = reconcileEvidence(
    [mad("contains", { matched: true, source: "tag" })],
    [mad("contains", { aiEscalated: true })],
  );
  assert.equal(contains.matchedAllergens[0].disagreement, undefined);

  const caution = reconcileEvidence(
    [mad("caution", { matched: true, source: "trace" })],
    [mad("caution", { aiEscalated: true })],
  );
  assert.equal(caution.matchedAllergens[0].disagreement, undefined);
});

test("rollup and confidence: a label_stricter escalation on one allergen still rolls up contains_allergen, confidence medium", () => {
  const { verdict, confidence } = reconcileEvidence(
    [mad("clear", { allergenName: "Milk" }), mad("clear", { allergenName: "Soy" })],
    [
      mad("contains", { allergenName: "Milk", aiEscalated: true, citedSpan: "whey" }),
      mad("unchecked", { allergenName: "Soy" }),
    ],
  );
  assert.equal(verdict, "contains_allergen");
  assert.equal(confidence, "medium");
});

test("rollup: a label_looser disagreement does not change the outcome a barcode-only scan would have had", () => {
  const barcodeOnlyVerdict = "contains_allergen";
  const { verdict } = reconcileEvidence(
    [mad("contains", { allergenName: "Milk", matched: true, source: "tag" })],
    [mad("unchecked", { allergenName: "Milk" })],
  );
  assert.equal(verdict, barcodeOnlyVerdict, "photo silence must never weaken what the barcode alone already established");
});

test("rollup: missing barcode data with everything silent on the label rolls up unable_to_confirm, not safe", () => {
  const { verdict, confidence } = reconcileEvidence(
    [],
    [mad("unchecked", { allergenName: "Milk" }), mad("unchecked", { allergenName: "Soy" })],
  );
  assert.equal(verdict, "unable_to_confirm");
  assert.equal(confidence, "low");
});
