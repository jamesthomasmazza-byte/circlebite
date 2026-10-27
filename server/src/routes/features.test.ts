import assert from "node:assert/strict";
import { test } from "node:test";

import { env } from "../env.js";
import { featuresRouter } from "./features.js";

// GET /features (2026-10-27): public, and nothing but the switches a signed-out page needs.

test("GET /features is public and returns exactly { guidedSetupEnabled }", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (featuresRouter as any).stack.find((l: any) => l.route?.path === "/features" && l.route.methods.get);
  assert.ok(layer);
  assert.equal(layer.route.stack.length, 1, "one handler: no requireAuth in front of it");
  let body: unknown;
  layer.route.stack[0].handle({}, { json: (b: unknown) => (body = b) });
  assert.deepEqual(body, { guidedSetupEnabled: env.guidedSetup });
});
