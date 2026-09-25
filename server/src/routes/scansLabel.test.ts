import assert from "node:assert/strict";
import { test } from "node:test";

import { env } from "../env.js";
import { scansRouter } from "./scans.js";

// This codebase has no HTTP-level test harness anywhere (no supertest, nothing spins up a real
// server) — every existing test either exercises a module directly or hits real Postgres. Building
// one just to prove a 4-line kill-switch guard 404s would be disproportionate to what it tests. So
// instead this reaches into the Express router directly and invokes the guard middleware itself, in
// isolation, bypassing requireAuth entirely (this test isn't about auth) — a legitimate way to unit
// test one middleware function in a chain without standing up a server or a session.
function findLabelScanGuard(): (req: unknown, res: unknown, next: (err?: unknown) => void) => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (scansRouter as any).stack.find((l: any) => l.route?.path === "/scans/label" && l.route.methods.post);
  assert.ok(layer, "expected a registered POST /scans/label route");
  const handlers = layer.route.stack;
  // [0] requireAuth, [1] the kill-switch guard, [2] multer, [3] the main async handler — see
  // scans.ts's own route registration order.
  assert.ok(handlers.length >= 2, "expected at least requireAuth + the kill-switch guard on this route");
  return handlers[1].handle;
}

test("POST /scans/label: the kill-switch guard 404s when LABEL_SCAN is off (env.labelScan false)", () => {
  assert.equal(env.labelScan, false, "this test assumes the default/local-dev env has LABEL_SCAN unset");

  const guard = findLabelScanGuard();
  let calledWith: unknown;
  guard({}, {}, (err) => {
    calledWith = err;
  });

  assert.ok(calledWith, "expected the guard to call next(err) rather than next()");
  assert.equal((calledWith as { status?: number }).status, 404);
  assert.equal((calledWith as { code?: string }).code, "not_found");
});
