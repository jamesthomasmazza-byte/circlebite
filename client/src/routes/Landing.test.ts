import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { CIRCLE_ROW_SOURCE } from "../lib/allergenRowCopy";
import { DEMO_NOTICE } from "../lib/demoNoticeCopy";
import { REGISTRATION_CLOSED } from "../lib/registrationCopy";
import { DISCLAIMER, EMERGENCY, VERDICT_LABEL } from "../lib/verdictCopy";
import { Landing, LANDING_TITLE, LandingPage } from "./Landing";

// The signed-out landing page (2026-10-30, docs/design/landing-mockup.html), rendered as HTML.
// With sign-up open unless a test says otherwise: REGISTRATION's own tests are below.

function render(registrationOpen: boolean): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(LandingPage, { registrationOpen })));
}

const html = render(true);
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
  // Inline pictures only, no other host, no stock photos. One image file: the logo (Nov 4), our own,
  // served from /brand/, named for screen readers as the text wordmark was.
  assert.doesNotMatch(html, /https?:\/\//);
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map(([tag]) => tag);
  assert.equal(imgs.length, 1);
  assert.match(imgs[0], /src="\/brand\/circlebite-logo-horizontal-light\.svg"/);
  assert.match(imgs[0], /alt="CircleBite"/);
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

test("nothing about age before sign-up: the date-of-birth gate stays neutral (docs/coppa.md §2.1)", () => {
  assert.doesNotMatch(text, /\badults?\b|\b18\b|grown-ups?|old enough|\bage\b/i);
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

// Rules only: a comment may name a selector it explains.
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

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

test("the bands reach both edges by cancelling the body's own padding, not with :has()", () => {
  const body = css.match(/\nbody \{([^}]*)\}/)![1];
  const landing = css.match(/\n\.landing \{([^}]*)\}/)![1];
  for (const side of ["top", "right", "bottom", "left"]) {
    const padding = body.match(new RegExp(`padding-${side}: (max\\([^;]+\\));`))![1];
    assert.ok(landing.includes(`calc(-1 * ${padding})`), side);
  }
  assert.doesNotMatch(css, /:has\(\.landing\)/);
});

test("the contest-demo notice sits with every 'Create an account': above the header, and under both buttons", () => {
  const creates = html.split(">Create an account<").length - 1;
  assert.equal(creates, 3);
  assert.equal(html.split(DEMO_NOTICE).length - 1, creates);
  assert.ok(html.indexOf(DEMO_NOTICE) < html.indexOf("<header"), "the strip comes before the header's button");
});

// REGISTRATION off (2026-11-06, Prof. Yoest's Nov 5 ask): no working sign-up link anywhere on the
// page, and the plain closed line where each "Create an account" was. Log in is unchanged.

test("with REGISTRATION off, the page has no sign-up link, and says sign-up is closed in each place", () => {
  const closed = render(false);
  assert.doesNotMatch(closed, /href="\/register/);
  assert.doesNotMatch(closed, />Create an account</);
  assert.equal(closed.split(`<p class="landing__closed">${REGISTRATION_CLOSED}</p>`).length - 1, 3);
  assert.deepEqual(
    [...closed.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].filter(([, h]) => h === "/login").map(([, , t]) => t),
    ["Log in", "Already have an account? Log in"],
  );
});

test("the page as served starts closed, before the switch is read, and opens only on registrationOpen: true", () => {
  const served = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Landing)));
  assert.doesNotMatch(served, /href="\/register/);
  const source = readFileSync(new URL("./Landing.tsx", import.meta.url), "utf8");
  assert.match(source, /useState\(false\);/);
  assert.match(source, /setRegistrationOpen\(f\.registrationOpen === true\)/);
});
