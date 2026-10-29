import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { Server } from "node:http";

import express from "express";

import { IMMUTABLE, REVALIDATE, serveClient } from "./serveClient.js";

// The built client's cache rules (2026-10-29), over real HTTP against a dist folder shaped like
// Vite's: hashed files in assets/ cached for a year and never re-checked; index.html, the
// client-route fallback and anything else re-checked on every load, so a deploy shows at once.

let dist: string;
let server: Server;
let baseUrl: string;

before(async () => {
  dist = await mkdtemp(path.join(tmpdir(), "circlebite-dist-"));
  await mkdir(path.join(dist, "assets"));
  await writeFile(path.join(dist, "index.html"), "<!doctype html><title>CircleBite</title>");
  await writeFile(path.join(dist, "assets", "index-oV8t54J6.js"), "console.log('bundle');");
  await writeFile(path.join(dist, "assets", "index-C_vuRMZY.css"), "body{}");
  await writeFile(path.join(dist, "favicon.svg"), "<svg/>");
  await writeFile(path.join(dist, "assets-like.js"), "// at the top of dist, not in assets/");

  const app = express();
  serveClient(app, dist);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dist, { recursive: true, force: true });
});

async function get(urlPath: string) {
  const res = await fetch(`${baseUrl}${urlPath}`);
  return { status: res.status, cacheControl: res.headers.get("cache-control"), body: await res.text() };
}

test("hashed files under /assets are cached for a year and never re-checked", async () => {
  for (const file of ["index-oV8t54J6.js", "index-C_vuRMZY.css"]) {
    const res = await get(`/assets/${file}`);
    assert.equal(res.status, 200, file);
    assert.equal(res.cacheControl, "public, max-age=31536000, immutable", file);
    assert.equal(res.body, await readFile(path.join(dist, "assets", file), "utf8"));
  }
  assert.equal(IMMUTABLE, "public, max-age=31536000, immutable");
});

test("index.html is re-checked on every load, so a deploy is picked up at once", async () => {
  for (const urlPath of ["/", "/index.html"]) {
    const res = await get(urlPath);
    assert.equal(res.status, 200, urlPath);
    assert.equal(res.cacheControl, "no-cache", urlPath);
    assert.match(res.body, /<title>CircleBite<\/title>/);
  }
  assert.equal(REVALIDATE, "no-cache");
});

test("a client-side route gets index.html, re-checked too", async () => {
  for (const urlPath of ["/scan", "/profiles/123/history", "/login"]) {
    const res = await get(urlPath);
    assert.equal(res.status, 200, urlPath);
    assert.equal(res.cacheControl, "no-cache", urlPath);
    assert.match(res.body, /<title>CircleBite<\/title>/, urlPath);
  }
});

test("anything outside /assets is re-checked, even a name that starts like it", async () => {
  for (const urlPath of ["/favicon.svg", "/assets-like.js"]) {
    const res = await get(urlPath);
    assert.equal(res.status, 200, urlPath);
    assert.equal(res.cacheControl, "no-cache", urlPath);
  }
});

test("production serves the client through these rules", async () => {
  const app = await readFile(new URL("../app.ts", import.meta.url), "utf8");
  assert.match(app, /if \(env\.isProduction\) \{[\s\S]*serveClient\(app, clientDist\);[\s\S]*\n {2}\}/);
  assert.doesNotMatch(app, /express\.static\(/, "no other static serving with default cache headers");
});
