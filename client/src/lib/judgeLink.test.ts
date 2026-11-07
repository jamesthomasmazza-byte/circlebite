import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { JUDGE_LINK_BARCODE, JUDGE_LINK_NOT_FOUND, judgeLinkLanding, judgeLinkToken, wantsJudgeCard } from "./judgeLink";

// The judge link's client half (2026-11-07). The server's half is server/src/auth/judgeLink.test.ts.

const repo = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");
const PAGE = repo("client/src/routes/JudgeLink.tsx");
const SCAN = repo("client/src/routes/Scan.tsx");

test("the judge barcode is the seed's shared one", () => {
  const seed = repo("server/src/db/seed/seedData.ts");
  assert.match(seed.slice(seed.indexOf("circleReported: {")), new RegExp(`^circleReported: \\{\\s*barcode: "${JUDGE_LINK_BARCODE}"`));
});

test("the token is read from the fragment only, and only if it's token-shaped", () => {
  const token = "A".repeat(43);
  assert.equal(judgeLinkToken(`#${token}`), token);
  assert.equal(judgeLinkToken(token), token);
  for (const bad of ["", "#", "#short", `#${token}&x=1`, `#${"a".repeat(129)}`, "#<script>"]) assert.equal(judgeLinkToken(bad), null, bad);
});

test("a signed-in judge lands on Scan for Maya with judge=1, and Scan reads that flag, never a barcode", () => {
  assert.equal(judgeLinkLanding("p-1"), "/scan?profile=p-1&judge=1");
  assert.equal(wantsJudgeCard("?profile=p-1&judge=1"), true);
  assert.equal(wantsJudgeCard("?profile=p-1&judge=0"), false);
  assert.equal(wantsJudgeCard("?barcode=2990000000083"), false);
  // Scan scans the constant, and drops the flag after, like the sample.
  assert.match(SCAN, /setBarcode\(JUDGE_LINK_BARCODE\);\s*void runScan\(JUDGE_LINK_BARCODE, profileId\);\s*navigate\(`\/scan\?profile=\$\{profileId\}`, \{ replace: true \}\);/);
  assert.doesNotMatch(SCAN, /get\("barcode"\)/);
});

test("the page drops the token from the address bar before it sends it, in the body only", () => {
  const replace = PAGE.indexOf("window.history.replaceState(null, \"\", JUDGE_LINK_PATH);");
  const send = PAGE.indexOf("signInWithJudgeLink(token)");
  assert.ok(replace > 0 && send > replace, "replaceState first, then the request");
  const api = repo("client/src/lib/api.ts");
  assert.match(api, /apiFetch\("\/auth\/judge-link", \{ method: "POST", body: JSON\.stringify\(\{ token \}\) \}\)/);
});

test("every failure reads the same: Page not found, and the page is marked noindex", () => {
  assert.equal(JUDGE_LINK_NOT_FOUND, "Page not found");
  assert.match(PAGE, /\.catch\(\(\) => setFailed\(true\)\)/);
  assert.match(PAGE, /meta\.content = "noindex, nofollow";/);
  assert.match(repo("client/src/main.tsx"), /<Route path="\/judge" element=\{<JudgeLink \/>\} \/>/);
  // One failure branch, one heading, nothing that says why.
  assert.equal(PAGE.split("setFailed(true)").length - 1, 2, "no token, and any refused request");
  assert.match(PAGE, /<main>\s*<h1>\{JUDGE_LINK_NOT_FOUND\}<\/h1>\s*<\/main>/);
});
