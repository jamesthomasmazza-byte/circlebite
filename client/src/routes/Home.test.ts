import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { safeReturnTo } from "../lib/returnTo";
import { homeFor } from "./Home";

// "/" (2026-10-30): the landing page only for someone signed out. Signed in, it's Scan, as before.

const MAIN = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");
const HOME = readFileSync(new URL("./Home.tsx", import.meta.url), "utf8");

test("signed in goes to Scan; signed out sees the landing page; never the landing page while loading", () => {
  assert.equal(homeFor({ user: { id: "u1" }, loading: false }), "scan");
  assert.equal(homeFor({ user: null, loading: false }), "landing");
  assert.equal(homeFor({ user: null, loading: true }), "loading");
  assert.equal(homeFor({ user: { id: "u1" }, loading: true }), "loading");
  assert.match(HOME, /if \(view === "scan"\) return <Navigate to={LANDING_PATH} replace \/>;/);
  assert.match(HOME, /if \(view === "loading"\) return <p>Loading…<\/p>;/);
});

test("/ sits outside RequireAuth; every other route is where it was", () => {
  const guarded = MAIN.slice(MAIN.indexOf("<Route element={<RequireAuth />}>"), MAIN.indexOf("{/* Sign-in lands on Scan"));
  assert.doesNotMatch(guarded, /path="\/"/);
  for (const route of [
    'path="/login" element={<Login />}',
    'path="/register" element={<RegisterEntry />}',
    'path="/follow/:token" element={<AcceptFollow />}',
    'path="/co-manager/:token" element={<AcceptCoManager />}',
    'path="/reset-password/:token" element={<ResetPassword />}',
    'path="/dashboard" element={<Navigate to={LANDING_PATH} replace />}',
    'path="/scan" element={<Scan />}',
  ]) {
    assert.ok(MAIN.includes(route), route);
  }
});

test("an invite's returnTo still survives sign-in and sign-up, and / after sign-in is Scan", () => {
  assert.equal(safeReturnTo("/follow/abc123"), "/follow/abc123");
  assert.equal(safeReturnTo("/co-manager/abc123"), "/co-manager/abc123");
  assert.equal(safeReturnTo("/"), "/");
  assert.equal(homeFor({ user: { id: "u1" }, loading: false }), "scan");
  for (const page of ["Login.tsx", "Register.tsx", "GuidedRegister.tsx"]) {
    assert.match(readFileSync(new URL(`./${page}`, import.meta.url), "utf8"), /safeReturnTo\(/, page);
  }
});
