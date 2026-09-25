import assert from "node:assert/strict";
import { test } from "node:test";

import { env } from "../env.js";
import { meRouter } from "./me.js";

// Same technique as scansLabel.test.ts: no HTTP harness exists in this codebase, so this reaches
// into the router directly and invokes the GET /me handler in isolation, bypassing requireAuth
// (not what this test is about) with a minimal fake req/res.
function findMeHandler(): (req: unknown, res: { json: (body: unknown) => void }) => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (meRouter as any).stack.find((l: any) => l.route?.path === "/me" && l.route.methods.get);
  assert.ok(layer, "expected a registered GET /me route");
  const handlers = layer.route.stack;
  // [0] requireAuth, [1] the actual handler — see me.ts's own route registration.
  assert.ok(handlers.length >= 2, "expected at least requireAuth + the /me handler");
  return handlers[1].handle;
}

test("GET /me exposes labelScanEnabled from env.labelScan, so the client can gate Path C without a second round trip", () => {
  const handler = findMeHandler();
  const req = { user: { id: "u1", email: "a@example.com", displayName: "A", isAdmin: false }, session: { id: "s1", actingProfileId: null } };
  let body: { labelScanEnabled?: boolean } | undefined;
  const res = { json: (b: unknown) => { body = b as typeof body; } };

  handler(req, res);

  assert.equal(body?.labelScanEnabled, env.labelScan);
});
