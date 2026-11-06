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
function findLabelScanGuard(path: string): (req: unknown, res: unknown, next: (err?: unknown) => void) => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (scansRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods.post);
  assert.ok(layer, `expected a registered POST ${path} route`);
  // By name, not position: on /scans/label, markScanStart (lib/scanTiming.ts) runs first.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const guard = layer.route.stack.find((h: any) => h.handle.name === "requireLabelScanEnabled");
  assert.ok(guard, `expected the kill-switch guard on ${path}`);
  return guard.handle;
}

// The switch is set off for each test and restored after, so a local .env with LABEL_SCAN on
// (dotenv, env.ts) can't decide the result.
function withLabelScanOff(run: () => void): void {
  const previous = env.labelScan;
  env.labelScan = false;
  try {
    run();
  } finally {
    env.labelScan = previous;
  }
}

test("POST /scans/label: the kill-switch guard 404s when LABEL_SCAN is off (env.labelScan false)", () => {
  const guard = findLabelScanGuard("/scans/label");
  let calledWith: unknown;
  withLabelScanOff(() =>
    guard({}, {}, (err) => {
      calledWith = err;
    }),
  );

  assert.ok(calledWith, "expected the guard to call next(err) rather than next()");
  assert.equal((calledWith as { status?: number }).status, 404);
  assert.equal((calledWith as { code?: string }).code, "not_found");
});

// The adaptive scan flow's discard endpoint ("that wasn't this product" — docs/verdict-engine.md
// Path D) shares the exact same middleware function (requireLabelScanEnabled) as /scans/label
// itself — a disabled LABEL_SCAN has to hide the whole feature, not just the first half of it.
test("POST /scans/label/discard: also 404s when LABEL_SCAN is off", () => {
  const guard = findLabelScanGuard("/scans/label/discard");
  let calledWith: unknown;
  withLabelScanOff(() =>
    guard({}, {}, (err) => {
      calledWith = err;
    }),
  );

  assert.ok(calledWith, "expected the guard to call next(err) rather than next()");
  assert.equal((calledWith as { status?: number }).status, 404);
  assert.equal((calledWith as { code?: string }).code, "not_found");
});
