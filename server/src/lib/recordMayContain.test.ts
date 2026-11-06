import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { recordMayContain } from "./recordMayContain.js";

test("the record's trace tags when there is a record; an empty list when it lists none", () => {
  assert.deepEqual(recordMayContain({ found: true, tracesTags: ["en:nuts", "en:sesame-seeds"] }), ["en:nuts", "en:sesame-seeds"]);
  assert.deepEqual(recordMayContain({ found: true, tracesTags: [] }), []);
});

test("null with no record: a barcode not on file, or a lookup that failed", () => {
  assert.equal(recordMayContain({ found: false, tracesTags: [] }), null);
});

test("a barcode scan's response carries it", () => {
  const route = readFileSync(new URL("../routes/scans.ts", import.meta.url), "utf8");
  assert.match(route, /record_may_contain: recordMayContain\(product\),/);
});
