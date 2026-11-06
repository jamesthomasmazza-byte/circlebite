import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The Account page (JT, 2026-11-06): one page for the account and its settings, at /settings. The
// Profile tab lists people only (lib/profileSections.test.ts). The page fetches on mount, so this
// reads the source.

const SOURCE = readFileSync(new URL("./Settings.tsx", import.meta.url), "utf8");
const LOG_OUT = "<button type=\"button\" onClick={handleLogout}>";

test("titled Account, back to Profiles, with who's signed in at the top", () => {
  assert.match(SOURCE, /<Link to="\/profiles">← Profiles<\/Link>/);
  assert.doesNotMatch(SOURCE, /#account/);
  assert.match(SOURCE, /<h1>Account<\/h1>\s*<p>\s*Signed in as \{user\?\.displayName\} \(\{user\?\.email\}\)\.\s*<\/p>/);
});

test("the sections keep their order, Admin comes before Delete, and Log out is last", () => {
  const at = (s: string) => {
    const i = SOURCE.indexOf(s);
    assert.ok(i > 0, s);
    return i;
  };
  const order = [
    at("<h1>Account</h1>"),
    at("<ProfileRenames"),
    at("<h2>Scan sounds</h2>"),
    at("<h2>Change your password</h2>"),
    at("<h2>Feedback</h2>"),
    at("<h2>Admin</h2>"),
    at("<h2>Delete your account</h2>"),
    at(LOG_OUT),
  ];
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.doesNotMatch(SOURCE.slice(at(LOG_OUT)), /<section|<h2>/, "nothing after Log out");
});

test("the Admin section, with its three links, shows only for an admin", () => {
  assert.match(SOURCE, /const isAdmin = user\?\.isAdmin === true;/);
  const start = SOURCE.indexOf("{isAdmin && (\n        <section>\n          <h2>Admin</h2>");
  const end = SOURCE.indexOf("<h2>Delete your account</h2>");
  assert.ok(start > 0 && end > start);
  const admin = SOURCE.slice(start, end);
  for (const path of ["/admin/ai-accuracy", "/admin/review-queue", "/admin/nps"]) {
    assert.ok(admin.includes(`<Link to="${path}">`), path);
    assert.equal(SOURCE.split(`"${path}"`).length - 1, 1, `${path} only in the Admin section`);
  }
});
