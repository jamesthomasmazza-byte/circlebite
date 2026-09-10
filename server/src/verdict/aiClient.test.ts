import assert from "node:assert/strict";
import { test } from "node:test";

import { FINDINGS_TOOL } from "./aiClient.js";

/**
 * Walks a JSON Schema node looking for every subschema with type "object", following both
 * `properties` (object schemas) and `items` (array schemas) — the two places a nested object can
 * appear in this tool's schema. Generic on purpose: this is meant to catch a new object node added
 * anywhere in the schema later, not just the two spots that broke production today.
 */
function collectObjectSchemas(node: unknown, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (typeof node !== "object" || node === null) return found;
  const schema = node as Record<string, unknown>;

  if (schema.type === "object") found.push(schema);

  if (schema.properties && typeof schema.properties === "object") {
    for (const value of Object.values(schema.properties as Record<string, unknown>)) {
      collectObjectSchemas(value, found);
    }
  }
  if (schema.items) {
    collectObjectSchemas(schema.items, found);
  }

  return found;
}

test("every object node in the tool's input_schema sets additionalProperties: false", () => {
  // This is the actual bug that kept the Path B AI call from ever succeeding in production:
  // strict: true requires additionalProperties: false on EVERY object schema, not just the root,
  // and the whole request is rejected (400, before inference) if even one is missing. The prior
  // unit tests all passed because the fake AI client in reasonVerdict.test.ts never validated the
  // real schema against the real API's rules — this test is what closes that gap, by walking the
  // actual schema generically instead of hardcoding a check of today's two object nodes.
  const objectSchemas = collectObjectSchemas(FINDINGS_TOOL.input_schema);

  // Sanity check the walker itself found something — an empty result here would make every
  // assertion below vacuously true and defeat the point of the test.
  assert.ok(objectSchemas.length >= 2, `expected to find at least the root and findings.items object schemas, found ${objectSchemas.length}`);

  for (const schema of objectSchemas) {
    assert.equal(
      schema.additionalProperties,
      false,
      `object schema missing additionalProperties: false — this is exactly what a strict-mode tool call rejects with a 400: ${JSON.stringify(schema)}`,
    );
  }
});

test("strict mode is still on — the fix is additionalProperties, not dropping strict", () => {
  // strict: true is what stops the model inventing fields outside the schema; that guarantee is
  // worth more here than the two additionalProperties lines it costs. Pinned so a future "just
  // make the 400 go away" edit can't quietly remove it instead of fixing the actual schema.
  assert.equal(FINDINGS_TOOL.strict, true);
});
