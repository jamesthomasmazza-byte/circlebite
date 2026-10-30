import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";

import { env } from "../env.js";
import { callAi, callAiVision, EXTRACT_LABEL_TOOL, FINDINGS_TOOL, MAX_RETRIES, REQUEST_TIMEOUT_MS } from "./aiClient.js";

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

// Path C's own tool, same bug class — run through the identical generic walker rather than a
// hand-written check, so this test would have caught the exact same production bug had it existed
// on this schema instead.
test("EXTRACT_LABEL_TOOL: every object node sets additionalProperties: false, strict stays on", () => {
  const objectSchemas = collectObjectSchemas(EXTRACT_LABEL_TOOL.input_schema);
  assert.ok(objectSchemas.length >= 1, `expected to find at least the root object schema, found ${objectSchemas.length}`);

  for (const schema of objectSchemas) {
    assert.equal(
      schema.additionalProperties,
      false,
      `object schema missing additionalProperties: false: ${JSON.stringify(schema)}`,
    );
  }
  assert.equal(EXTRACT_LABEL_TOOL.strict, true);
});

test("EXTRACT_LABEL_TOOL: legible and complete are reported as separate required fields", () => {
  // The whole point of this schema shape (docs/verdict-engine.md Path C plan): "legible" and
  // "complete" answer two different questions, and collapsing them back into one boolean would
  // silently reopen the false-safe hole this design exists to close.
  const schema = EXTRACT_LABEL_TOOL.input_schema as { required?: string[] };
  assert.ok(schema.required?.includes("legible"));
  assert.ok(schema.required?.includes("complete"));
  assert.ok(schema.required?.includes("incompleteReason"));
});

// ---- Timeout and retries (2026-10-30) ----------------------------------------------------------
// Against a local stand-in for the API: a 30 s attempt and one retry, and every request counted.

async function withStubApi(statuses: number[], body: () => Promise<void>): Promise<number> {
  let request = 0;
  const server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      const status = statuses[Math.min(request, statuses.length - 1)];
      request += 1;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(status === 200 ? JSON.stringify(TOOL_REPLY) : JSON.stringify({ type: "error", error: { type: "api_error", message: "stub" } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const savedKey = env.aiApiKey;
  const savedBase = process.env.ANTHROPIC_BASE_URL;
  env.aiApiKey = "test-key-not-real";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await body();
  } finally {
    env.aiApiKey = savedKey;
    if (savedBase === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = savedBase;
    server.close();
  }
  return request;
}

const TOOL_REPLY = {
  id: "msg_stub",
  type: "message",
  role: "assistant",
  model: "stub",
  stop_reason: "tool_use",
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 5 },
  content: [
    {
      type: "tool_use",
      id: "tu_1",
      name: "report_allergen_findings",
      input: { findings: [], unresolvedTerms: [] },
    },
  ],
};

const PROMPT = { allergens: [], ingredientsText: "water", deterministicHits: [] };

test("each attempt may take 30 s, and a failed one is tried once more, not twice", () => {
  assert.equal(REQUEST_TIMEOUT_MS, 30_000);
  assert.equal(MAX_RETRIES, 1);
});

test("a call that succeeds on its retry says it took two attempts", async () => {
  const sent = await withStubApi([500, 200], async () => {
    const result = await callAi(PROMPT);
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
  });
  assert.equal(sent, 2);
});

test("a call that keeps failing stops after two attempts, fails closed, and says so", async () => {
  const sent = await withStubApi([500], async () => {
    const result = await callAi(PROMPT);
    assert.deepEqual(result, { ok: false, reason: "api_error_500", attempts: 2 });
    const vision = await callAiVision(Buffer.from("x"), "image/jpeg");
    assert.deepEqual(vision, { ok: false, reason: "api_error_500", attempts: 2 });
  });
  assert.equal(sent, 4, "two for each call, never three");
});

test("a first-time success is one attempt", async () => {
  await withStubApi([200], async () => {
    const result = await callAi(PROMPT);
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 1);
  });
});
