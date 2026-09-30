import assert from "node:assert/strict";
import { test } from "node:test";

import type { ScanResult } from "./api";
import {
  CLAIM_LABEL,
  classificationLabel,
  isTraceEscalatedToContains,
  SOURCE_LABEL,
  sourceLabel,
  type MatchedRow,
} from "./allergenRowCopy";

// Properties, not pinned sentences: the words may change, the distinction may not. "contains" vs
// "may contain" has been a real bug once — the card read "Contains sesame" when the package said
// "may contain".

const SCAN_SOURCES: ScanResult["source"][] = ["barcode", "label_photo", "combined", "manual"];

// Every row shape the card can be handed. Spans deliberately use the words the assertions look for,
// so the only thing keeping a check green is that quoted evidence is treated as the package's words,
// not ours.
function allRows(): MatchedRow[] {
  const rows: MatchedRow[] = [];
  for (const classification of Object.keys(CLAIM_LABEL) as MatchedRow["classification"][]) {
    for (const source of [null, ...(Object.keys(SOURCE_LABEL) as NonNullable<MatchedRow["source"]>[])]) {
      for (const aiEscalated of [false, true]) {
        for (const escalatedFromTrace of [undefined, true]) {
          for (const communityReported of [undefined, true]) {
            for (const evidenceSource of [undefined, "barcode", "label"] as const) {
              rows.push({
                allergenName: "Sesame",
                severity: "severe",
                matched: classification !== "clear",
                source,
                classification,
                aiEscalated,
                escalatedFromTrace,
                communityReported,
                communityReporterCount: communityReported ? 2 : undefined,
                evidenceSource,
                citedSpan: aiEscalated ? "Contains: sesame. May contain traces of nuts" : undefined,
                matchedText: source === "ingredients" ? "contains sesame" : undefined,
              } as MatchedRow);
            }
          }
        }
      }
    }
  }
  return rows;
}

/** The row as read: claim, then source with quoted evidence (the package's own words) removed. */
function rowCopy(m: MatchedRow, scanSource: ScanResult["source"]) {
  const claim = classificationLabel(m);
  const source = sourceLabel(m, { source: scanSource }).replace(/"[^"]*"/g, "");
  return { claim, source, both: `${claim} ${source}` };
}

const BARE_CONTAINS = /\bcontains\b/i;
const TRACE_WORDS = /may contain|trace/i;

function isTraceUnsafe(m: MatchedRow) {
  return !m.communityReported && isTraceEscalatedToContains(m);
}

test("a may-contain claim never produces the bare word 'contains'", () => {
  let checked = 0;
  for (const m of allRows().filter((r) => r.classification === "caution")) {
    for (const scanSource of SCAN_SOURCES) {
      const { both } = rowCopy(m, scanSource);
      assert.doesNotMatch(both, BARE_CONTAINS, `caution row reads "${both}"`);
      checked++;
    }
  }
  assert.ok(checked > 0);
});

test("a contains claim never produces 'may contain' or 'trace'", () => {
  let checked = 0;
  for (const m of allRows().filter((r) => r.classification === "contains" && !isTraceUnsafe(r))) {
    for (const scanSource of SCAN_SOURCES) {
      const { both } = rowCopy(m, scanSource);
      assert.doesNotMatch(both, TRACE_WORDS, `contains row reads "${both}"`);
      checked++;
    }
  }
  assert.ok(checked > 0);
});

test("a trace the profile treats as unsafe still reads as a trace claim, never as 'contains'", () => {
  // The row takes the unsafe colour and weight (Scan.tsx's rowClaim), but the words say what the
  // package said: "may contain". What the app decided is the row's look, not a rewritten claim.
  const traceUnsafe = allRows().filter(isTraceUnsafe);
  // Both ways in: the deterministic trace tag, and an AI-reported trace.
  assert.ok(traceUnsafe.some((m) => !m.aiEscalated && m.source === "trace"));
  assert.ok(traceUnsafe.some((m) => m.aiEscalated && m.escalatedFromTrace));
  for (const m of traceUnsafe) {
    for (const scanSource of SCAN_SOURCES) {
      const { claim, both } = rowCopy(m, scanSource);
      assert.match(claim, TRACE_WORDS, `trace-unsafe claim reads "${claim}"`);
      assert.doesNotMatch(both, BARE_CONTAINS, `trace-unsafe row reads "${both}"`);
    }
  }
});

test("every classification value has a label — no fallthrough, no empty string, no raw enum name", () => {
  // "contains" is the one value whose enum name is also the right word; every other value must be
  // translated, since "unresolved" or "unchecked" on a card reads as a system state, not a claim.
  const plainEnglish = new Set(["contains"]);
  for (const [value, label] of Object.entries(CLAIM_LABEL)) {
    assert.ok(label.trim(), `${value} has an empty label`);
    assert.doesNotMatch(label, /_/, `${value}'s label looks like an enum: "${label}"`);
    if (!plainEnglish.has(value)) assert.notEqual(label, value, `${value} is shown as its raw enum name`);
  }
  // Distinct: no value borrows another value's words — that's what a fallthrough does.
  assert.equal(new Set(Object.values(CLAIM_LABEL)).size, Object.keys(CLAIM_LABEL).length);

  for (const m of allRows()) {
    for (const scanSource of SCAN_SOURCES) {
      const claim = classificationLabel(m);
      assert.ok(claim.trim(), `empty claim for ${JSON.stringify(m)}`);
      assert.doesNotMatch(claim, /_|^(undefined|null)$/);
      const source = sourceLabel(m, { source: scanSource });
      assert.ok(source.trim(), `empty source for ${JSON.stringify(m)}`);
      assert.doesNotMatch(source, /_|^(tag|ingredients|trace|undefined|null)$/, `raw source value: "${source}"`);
    }
  }
});

test("every source value has a label for both the product record and the photographed label", () => {
  for (const [value, labels] of Object.entries(SOURCE_LABEL)) {
    for (const label of [labels.record, labels.photo]) {
      assert.ok(label.trim(), `${value} has an empty label`);
      assert.notEqual(label, value);
    }
  }
  // Where a structured tag or a trace is listed must differ by where the row came from.
  assert.notEqual(SOURCE_LABEL.tag.record, SOURCE_LABEL.tag.photo);
  assert.notEqual(SOURCE_LABEL.trace.record, SOURCE_LABEL.trace.photo);
});

test("a row quotes only text that exists — no quote without matchedText or citedSpan", () => {
  for (const m of allRows()) {
    const bare = { ...m, matchedText: undefined, citedSpan: undefined };
    for (const scanSource of SCAN_SOURCES) {
      assert.doesNotMatch(sourceLabel(bare, { source: scanSource }), /"/, `quote with no evidence: ${JSON.stringify(bare)}`);
    }
  }
});
