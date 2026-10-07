// Everything the judge seed (judgeSeed.ts) creates — invented people, invented children, invented
// products. Synthetic only (CONTEST_RULES.md R9): no real person, no real address, no real product.
//
// Every row gets a fixed UUID under a "5eed" prefix (valid hex, reads as "seed"), one namespace per
// table, so a reseed ends in exactly the same rows every time and the tests can compare snapshots.
// The 5eed0000- namespace is the NPS rows', unchanged from the old seedJudgeNps.ts so a reseed
// replaces rather than duplicates anything that script already wrote.

import { SEED_EMAIL_DOMAIN } from "../../lib/seedMarker.js";
import type { Severity } from "../../matcher/match.js";

function seedId(namespace: number, n: number): string {
  return `5eed${String(namespace).padStart(4, "0")}-0000-0000-0000-${String(n).padStart(12, "0")}`;
}

// ---- Four judges, four separate worlds ---------------------------------------------------------------
// judge1..judge4, so four judges can test at once without seeing each other's history, banner,
// acknowledgements or downgrades. Each judge gets a whole cast of their own — the people around them
// and the three children — built from one template (judgeCast below), so no judge can reach another's
// children by any role. Only the products, the reporting families and their reports are shared: the
// reported warning is meant to be the same cross-family claim for everyone.
//
// Ids: cast n's rows are the template's ids offset by (n - 1) * CAST_ID_STRIDE in each namespace, so
// judge 1's are the ids the single-judge seed used. The reporting families' ids sit just past the
// template's in the same namespaces, below the stride.

export const JUDGE_COUNT = 4;
const CAST_ID_STRIDE = 100;

export type Person = { id: string; email: string; displayName: string; isJudge: boolean };
type SeedAllergen = { id: string; name: string; severity: Severity; treatTracesAsUnsafe: boolean };
export type SeedProfile = { id: string; label: string; owner: string; allergens: SeedAllergen[] };
type CoManager = { id: string; profile: string; person: string; addedBy: string };
type Follower = { id: string; profile: string; person: string; invitedBy: string; shareLevel: "all" | "severe_only" };
type SeedScan = { id: string; profile: string; scanner: string; product: ProductKey; daysAgo: number };

/** One judge's cast, as keys into PEOPLE and PROFILES — e.g. { judge: "judge2", maya: "maya2", ... }. */
export type JudgeCast = { n: number; judge: string; priya: string; sam: string; elena: string; maya: string; leo: string; noor: string };

export const JUDGE_CASTS: JudgeCast[] = Array.from({ length: JUDGE_COUNT }, (_, i) => {
  const n = i + 1;
  return { n, judge: `judge${n}`, priya: `priya${n}`, sam: `sam${n}`, elena: `elena${n}`, maya: `maya${n}`, leo: `leo${n}`, noor: `noor${n}` };
});

export const PEOPLE: Record<string, Person> = {};
export const PROFILES: Record<string, SeedProfile> = {};
export const CO_MANAGERS: CoManager[] = [];
export const FOLLOWERS: Follower[] = [];
export const SCANS: SeedScan[] = [];

for (const cast of JUDGE_CASTS) {
  const { n } = cast;
  const id = (namespace: number, k: number) => seedId(namespace, (n - 1) * CAST_ID_STRIDE + k);

  // ---- People. Only the judge can sign in (judgeSeed.ts). ----
  PEOPLE[cast.judge] = { id: id(1, 1), email: `judge${n}@${SEED_EMAIL_DOMAIN}`, displayName: `Judge ${n}`, isJudge: true };
  PEOPLE[cast.priya] = { id: id(1, 2), email: `priya.nair.${n}@${SEED_EMAIL_DOMAIN}`, displayName: "Priya Nair", isJudge: false };
  PEOPLE[cast.sam] = { id: id(1, 3), email: `sam.okafor.${n}@${SEED_EMAIL_DOMAIN}`, displayName: "Sam Okafor", isJudge: false };
  PEOPLE[cast.elena] = { id: id(1, 4), email: `elena.varga.${n}@${SEED_EMAIL_DOMAIN}`, displayName: "Elena Varga", isJudge: false };

  // ---- Profiles (invented children) and their allergens. ----
  // The judge's own. Covers both trace settings: peanut traces count as "contains", sesame traces
  // only as "may contain", so Maya's history can show a caution verdict too.
  PROFILES[cast.maya] = {
    id: id(2, 1),
    label: "Maya",
    owner: cast.judge,
    allergens: [
      { id: id(3, 1), name: "Peanut", severity: "severe", treatTracesAsUnsafe: true },
      { id: id(3, 2), name: "Sesame", severity: "moderate", treatTracesAsUnsafe: false },
    ],
  };
  PROFILES[cast.leo] = {
    id: id(2, 2),
    label: "Leo",
    owner: cast.sam,
    allergens: [
      { id: id(3, 3), name: "Milk", severity: "severe", treatTracesAsUnsafe: true },
      { id: id(3, 4), name: "Egg", severity: "mild", treatTracesAsUnsafe: true },
    ],
  };
  PROFILES[cast.noor] = {
    id: id(2, 3),
    label: "Noor",
    owner: cast.elena,
    allergens: [
      { id: id(3, 5), name: "Tree nut", severity: "severe", treatTracesAsUnsafe: true },
      { id: id(3, 6), name: "Wheat", severity: "moderate", treatTracesAsUnsafe: true },
    ],
  };

  // ---- Circle edges: every role, from the judge's side. ----
  // Owner of Maya, co-manager of Leo, follower of Noor — so the judge meets each role's experience,
  // including the follower's escalate-only report form (Oct 1 rule). Maya has a co-manager (Priya),
  // so if the judge deletes the account, Maya transfers to her instead of being destroyed
  // (docs/coppa.md §2.6).
  CO_MANAGERS.push(
    { id: id(4, 1), profile: cast.maya, person: cast.priya, addedBy: cast.judge },
    { id: id(4, 2), profile: cast.leo, person: cast.judge, addedBy: cast.sam },
  );
  FOLLOWERS.push(
    { id: id(5, 1), profile: cast.noor, person: cast.judge, invitedBy: cast.elena, shareLevel: "all" },
    { id: id(5, 2), profile: cast.noor, person: cast.priya, invitedBy: cast.elena, shareLevel: "severe_only" },
  );

  // ---- Scan history. ----
  // matched_allergens and result are computed by the real matcher at seed time (judgeSeed.ts), never
  // written by hand, so history shows exactly what a rescan would. No verdict_explanations rows: these
  // never touched the AI, and the AI accuracy page only counts scans that did.
  SCANS.push(
    { id: id(6, 1), profile: cast.maya, scanner: cast.judge, product: "crackers", daysAgo: 13 },
    { id: id(6, 2), profile: cast.maya, scanner: cast.judge, product: "peanutBar", daysAgo: 11 },
    { id: id(6, 3), profile: cast.maya, scanner: cast.priya, product: "oatBiscuits", daysAgo: 8 },
    { id: id(6, 4), profile: cast.maya, scanner: cast.judge, product: "unknown", daysAgo: 6 },
    { id: id(6, 5), profile: cast.maya, scanner: cast.priya, product: "reported", daysAgo: 4 },
    { id: id(6, 6), profile: cast.leo, scanner: cast.sam, product: "yogurtDrink", daysAgo: 10 },
    { id: id(6, 7), profile: cast.leo, scanner: cast.sam, product: "crackers", daysAgo: 5 },
    { id: id(6, 8), profile: cast.noor, scanner: cast.elena, product: "granola", daysAgo: 7 },
  );
}

// ---- The reporting families, shared by every judge ------------------------------------------------
// The two families behind COMMUNITY_REPORTS — outside every judge's circle, so the escalation a judge
// sees on PRODUCTS.reported genuinely comes from other households, and it's the same claim for all
// four. Each files from their own child's scan, so each counts as their own family.

PEOPLE.tomas = { id: seedId(1, 5), email: `tomas.reyes@${SEED_EMAIL_DOMAIN}`, displayName: "Tomás Reyes", isJudge: false };
PEOPLE.grace = { id: seedId(1, 6), email: `grace.lin@${SEED_EMAIL_DOMAIN}`, displayName: "Grace Lin", isJudge: false };

// Peanut on both, spelled the same: corroboration matches the reported allergen's text exactly
// (recordCorrection.ts), so "Peanuts" would be a separate claim.
PROFILES.ana = {
  id: seedId(2, 4),
  label: "Ana",
  owner: "tomas",
  allergens: [{ id: seedId(3, 7), name: "Peanut", severity: "severe", treatTracesAsUnsafe: true }],
};
PROFILES.ben = {
  id: seedId(2, 5),
  label: "Ben",
  owner: "grace",
  allergens: [
    { id: seedId(3, 8), name: "Peanut", severity: "moderate", treatTracesAsUnsafe: false },
    { id: seedId(3, 9), name: "Egg", severity: "mild", treatTracesAsUnsafe: true },
  ],
};

SCANS.push(
  { id: seedId(6, 9), profile: "ana", scanner: "tomas", product: "reported", daysAgo: 9 },
  { id: seedId(6, 10), profile: "ben", scanner: "grace", product: "reported", daysAgo: 6 },
);

// ---- Products ----------------------------------------------------------------------------------------
// Every barcode is a 13-digit GTIN with a deliberately WRONG check digit (judgeSeed.test.ts proves
// it). GS1 requires a valid one, so no real product can ever carry these — and the scan route only
// checks for 6-14 digits, so they scan like any other. Each is written to the `products` cache
// marked circlebite_seed, which getProduct never refreshes (lib/productLookup.ts), so a judge
// rescanning one mid-week gets the same verdict their history shows.
//
// Found products carry structured allergen tags (stored normalized, the way openFoodFacts.ts
// stores them), so they're "good data": no Path B, so no AI call and no AI spend on a rescan, and no
// required photo. Tags are matched exactly against the matcher's keywords (matcher/synonyms.ts).

export type ProductKey = "crackers" | "peanutBar" | "oatBiscuits" | "unknown" | "yogurtDrink" | "granola" | "reported";

export type SeedProduct = {
  barcode: string;
  found: boolean;
  name: string | null;
  brand: string | null;
  ingredientsText: string | null;
  allergensTags: string[];
  tracesTags: string[];
};

export const PRODUCTS: Record<ProductKey, SeedProduct> = {
  // Soy only — on nobody's list, so "No listed allergens found" for Maya and Leo alike.
  crackers: {
    barcode: "2990000000014",
    found: true,
    name: "Plain Rice Crackers",
    brand: "Hearthfield",
    ingredientsText: "rice flour, sunflower oil, sea salt, soy lecithin",
    allergensTags: ["soybeans"],
    tracesTags: [],
  },
  peanutBar: {
    barcode: "2990000000021",
    found: true,
    name: "Crunchy Peanut Bar",
    brand: "Hearthfield",
    ingredientsText: "roasted peanuts, glucose syrup, cane sugar, salt",
    allergensTags: ["peanuts"],
    tracesTags: [],
  },
  // A sesame trace: Maya's sesame doesn't treat traces as unsafe, so "May contain — caution".
  oatBiscuits: {
    barcode: "2990000000038",
    found: true,
    name: "Oat Biscuits",
    brand: "Millbrook",
    ingredientsText: "oat flour, wheat flour, cane sugar, palm oil",
    allergensTags: ["gluten"],
    tracesTags: ["sesame"],
  },
  // The deliberate not-found barcode: "Unable to confirm", the fourth verdict.
  unknown: { barcode: "2990000000045", found: false, name: null, brand: null, ingredientsText: null, allergensTags: [], tracesTags: [] },
  yogurtDrink: {
    barcode: "2990000000052",
    found: true,
    name: "Vanilla Yogurt Drink",
    brand: "Millbrook",
    ingredientsText: "skimmed milk, sugar, vanilla extract",
    allergensTags: ["milk"],
    tracesTags: [],
  },
  granola: {
    barcode: "2990000000069",
    found: true,
    name: "Almond Granola",
    brand: "Hearthfield",
    ingredientsText: "rolled oats, almonds, honey, sunflower oil",
    allergensTags: ["almonds"],
    tracesTags: [],
  },
  // Not found, and carries the seeded community reports: the engine says "Unable to confirm", and
  // two families' corroborated reports escalate it to "Contains" for anyone with peanut on their list.
  reported: { barcode: "2990000000076", found: false, name: null, brand: null, ingredientsText: null, allergensTags: [], tracesTags: [] },
};

// ---- The seeded community reports ------------------------------------------------------------------
// Two families, because a warning reaches other families only once two have reported it
// (recordCorrection.ts, CORROBORATION_THRESHOLD — one report until 2026-10-07). Each reporter files
// from their own child's scan, so each counts as their own family. The seed inserts them pending and
// runs the real threshold step; it never writes 'corroborated' itself (judgeSeed.ts). Live only for
// PRODUCTS.reported's barcode, which no real product can have.

export type SeedCommunityReport = {
  id: string;
  scan: string;
  reporter: string;
  product: ProductKey;
  allergen: string;
  note: string;
  /** Fixed path, overwritten on every run, under UPLOAD_DIR like every real correction photo. */
  photoPath: string;
};

export const COMMUNITY_REPORTS: SeedCommunityReport[] = [
  {
    id: seedId(7, 1),
    scan: seedId(6, 9),
    reporter: "tomas",
    product: "reported",
    allergen: "Peanut",
    note: "Seeded example: the package lists peanut, and the product database has no record of it.",
    photoPath: "corrections/5eed0007-community-report.png",
  },
  {
    id: seedId(7, 2),
    scan: seedId(6, 10),
    reporter: "grace",
    product: "reported",
    allergen: "Peanut",
    note: "Seeded example: peanut is in the ingredients list on the back of the box.",
    photoPath: "corrections/5eed0007-community-report-2.png",
  },
];

// A 1x1 grey PNG — the placeholder for the seeded reports' required photos. A real PNG, so the
// admin review queue's photo link serves an actual image.
export const PLACEHOLDER_PHOTO_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==",
  "base64",
);

// ---- NPS (folded in from the old seedJudgeNps.ts, rows unchanged) ----------------------------------------
// 15 promoters, 5 passives, 4 detractors — n = 24, clears NPS_SMALL_SAMPLE_THRESHOLD (20) so the
// admin page shows a real score, not the small-n message. Written with source = 'seed' (migration
// 0024), which keeps them separable from real responses on the NPS page.

export const NPS_ROWS: { id: string; score: number; reason: string | null }[] = [
  { score: 10, reason: "The circle is exactly what my family needed." },
  { score: 10, reason: "Finally an app that admits when it doesn't know." },
  { score: 10, reason: null },
  { score: 10, reason: "My mother-in-law can scan for the kids now." },
  { score: 9, reason: "Love that the disclaimer is always right there." },
  { score: 9, reason: null },
  { score: 9, reason: "Corrections actually feel like they go somewhere." },
  { score: 9, reason: null },
  { score: 10, reason: "Simple, and it doesn't pretend to know more than it does." },
  { score: 9, reason: null },
  { score: 10, reason: "The severity levels per allergen are a big deal for us." },
  { score: 9, reason: null },
  { score: 10, reason: "Invite flow for the babysitter took thirty seconds." },
  { score: 9, reason: "Would like a scan history longer than a handful." },
  { score: 10, reason: null },
  { score: 8, reason: "Camera scanning is a little slow to focus." },
  { score: 7, reason: null },
  { score: 8, reason: "Wish I could see more than the last few scans." },
  { score: 7, reason: "Good, just wish the app remembered my usual profile." },
  { score: 8, reason: null },
  { score: 4, reason: "Too many taps to report a wrong ingredient." },
  { score: 3, reason: null },
  { score: 5, reason: "Unable to confirm too often for common products." },
  { score: 2, reason: "Wanted a health score, not a yes/no." },
].map((row, i) => ({ id: seedId(0, i + 1), ...row }));

export const SEED_BARCODES = Object.values(PRODUCTS).map((p) => p.barcode);
