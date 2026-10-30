import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { CIRCLE_ROW_SOURCE } from "../lib/allergenRowCopy";
import { DISCLAIMER, EMERGENCY, VERDICT_LABEL } from "../lib/verdictCopy";
import { Landing, LANDING_TITLE } from "./Landing";

// The signed-out landing page (2026-10-30, docs/design/landing-mockup.html), rendered as HTML.

const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Landing)));
const text = html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ");

function hrefsOf(label: string): string[] {
  return [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].filter(([, , t]) => t === label).map(([, h]) => h);
}

test("every Create an account goes to /register, every Log in to /login: real links", () => {
  assert.deepEqual(hrefsOf("Create an account"), ["/register", "/register", "/register"]);
  assert.deepEqual(hrefsOf("Log in"), ["/login"]);
  assert.deepEqual(hrefsOf("Already have an account? Log in"), ["/login"]);
  assert.deepEqual(hrefsOf("See how it works"), ["#how"]);
  assert.match(html, /<section id="how">/);
});

test("one h1, and every picture is one described image", () => {
  assert.equal(html.match(/<h1[ >]/g)?.length, 1);
  const pictures = [...html.matchAll(/role="img"([^>]*)>/g)];
  assert.equal(pictures.length, 6);
  for (const [, attrs] of pictures) assert.match(attrs, /aria-label="[^"]{20,}"/);
  // Inline pictures only: no image files, no other host, no stock photos.
  assert.doesNotMatch(html, /<img\b|https?:\/\//);
});

test("the pictured cards use the app's own words, and carry the disclaimer", () => {
  assert.match(text, new RegExp(VERDICT_LABEL.contains_allergen));
  assert.match(text, new RegExp(VERDICT_LABEL.may_contain_caution));
  assert.match(text, /found in ingredient text — "sesame"/);
  assert.match(text, /allergen warning on the product record/);
  assert.match(text, new RegExp(CIRCLE_ROW_SOURCE));
  assert.match(text, /A co-manager in Noor's circle reported Wheat present and photographed the label\. No other family has confirmed it yet\./);
  assert.equal(text.split(DISCLAIMER).length - 1, 2, "inside both pictured result cards");
  assert.match(text, new RegExp(EMERGENCY.replace(".", "\\.")));
  assert.match(text, /Unable to confirm/);
});

test("never 'Safe', synthetic names only, the invented brand, no emoji", () => {
  assert.doesNotMatch(text, /\bsafe\b/i);
  assert.match(text, /Maya's profile/);
  assert.match(text, /Fernhallow/);
  assert.doesNotMatch(text, /Millbrook/);
  assert.doesNotMatch(text, /\p{Extended_Pictographic}/u);
});

test("the copy the mockup approved, line by line", () => {
  for (const line of [
    "Check every label against your child's allergies.",
    "Reading labels is a second job.",
    "whey and casein are milk, semolina is wheat, tahini is sesame.",
    "It takes two separate families to confirm a warning for everyone.",
    "a report that an allergen isn't there waits for review, so one mistaken report can't remove it.",
    "A child's profile holds their name and allergy details.",
    "The camera runs only while you scan.",
    "Followers never see who else is in the circle.",
    "No ads, and your data is never sold.",
    "add your child's allergens one question at a time",
  ]) {
    assert.ok(text.includes(line), line);
  }
});

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("Public Sans is self-hosted with its licence, and only the landing page uses it", () => {
  const faces = [...css.matchAll(/@font-face\s*{[^}]*}/g)].map(([f]) => f);
  assert.equal(faces.length, 6);
  for (const face of faces) assert.match(face, /src: url\("\.\/fonts\/PublicSans-[A-Za-z]+\.woff2"\) format\("woff2"\);/);
  for (const face of faces) readFileSync(new URL(face.match(/\.\/fonts\/[^"]+/)![0].replace("./", "../"), import.meta.url));
  assert.match(readFileSync(new URL("../fonts/OFL.txt", import.meta.url), "utf8"), /SIL Open Font License, Version 1\.1/);
  assert.deepEqual(
    [...css.matchAll(/([^{}]+)\{[^}]*font-family: "Public Sans", var\(--font-sans\)/g)].map(([, sel]) => sel.trim()),
    [".landing"],
  );
  const index = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(css + index, /googleapis|gstatic/);
});

test("a title and a meta description for search, from the approved copy", () => {
  assert.equal(LANDING_TITLE, "CircleBite: check labels against your child's allergies");
  const index = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const description = index.match(/<meta\s+name="description"\s+content="([^"]+)"/)?.[1];
  assert.ok(description && text.includes(description), "the hero's own lead sentence");
  // Signed-in pages keep the plain name: the landing page puts it back when it unmounts.
  assert.match(index, /<title>CircleBite<\/title>/);
});
