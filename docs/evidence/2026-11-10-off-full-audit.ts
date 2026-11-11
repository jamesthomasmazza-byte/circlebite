// Read-only audit of CircleBite's matcher against the full Open Food Facts CSV export (2026-11-10).
// Writes results to the output directory it is given. Touches nothing in the repo. Its findings are
// in 2026-11-10-off-full-audit.md; the fix they led to is measured in 2026-11-10-matcher-before-after.ts.
//
// Copied from the audit's working directory, with one change: it imported the matcher by the absolute
// path of that session's checkout, and here it imports it relative to this file, so it runs from the
// repo root:
//   node_modules/.bin/tsx docs/evidence/2026-11-10-off-full-audit.ts \
//     ~/Downloads/en.openfoodfacts.org.products.csv.gz <output-dir>
// It measures the matcher as checked out, so to reproduce the findings check out ab949a3 first.
import { createReadStream, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { computeVerdict, matchAllergen } from "../../server/src/matcher/match.ts";
import { SYNONYM_CLUSTERS } from "../../server/src/matcher/synonyms.ts";

const [, , csvPath, outDir] = process.argv;
const norm = (t: string) => t.replace(/^[a-z]{2}:/i, "").toLowerCase().replace(/-/g, " ").trim();
const alias = (id: string) => SYNONYM_CLUSTERS.find((c) => c.id === id)?.aliases[0];

// OFF normalized tag -> profile allergen name (a cluster alias) 
const TAG_TO_NAME: Record<string, string> = {
  "milk": "milk", "gluten": "gluten", "eggs": "egg", "soybeans": "soy", "peanuts": "peanut",
  "nuts": "tree nuts", "fish": "fish", "crustaceans": "crustaceans", "molluscs": "molluscs",
  "sesame seeds": "sesame", "celery": "celery", "mustard": "mustard",
  "sulphur dioxide and sulphites": "sulphites", "lupin": "lupin",
};
for (const [t, n] of Object.entries(TAG_TO_NAME)) if (!SYNONYM_CLUSTERS.some((c) => c.aliases.includes(n))) console.error("no cluster alias for", t, n);

// Hidden names (FDA/FARE "other names"), checked on the text directly, independent of OFF tags.
const HIDDEN: Record<string, RegExp> = {
  milk: /\b(casein|caseinate|caseinates|whey|lactalbumin|lactoglobulin|lactoferrin|ghee|lactose|curds?|paneer|kefir|recaldent|butterfat|butter ?milk|cream|yogh?urt|cheese)\b/i,
  egg: /\b(albumin|albumen|ovalbumin|ovomucoid|ovomucin|lysozyme|meringue|mayonnaise|globulin|livetin|vitellin|surimi)\b/i,
  gluten: /\b(durum|semolina|spelt|farro|einkorn|emmer|kamut|seitan|bulgu?r|couscous|triticale|graham|farina|malt|barley|rye|wheat)\b/i,
  soy: /\b(edamame|miso|tempeh|natto|tofu|shoyu|tamari|soy|soya|soja|textured vegetable protein|tvp|okara|yuba)\b/i,
  peanut: /\b(arachis|goober|groundnuts?|peanuts?|mandelonas|monkey nuts?)\b/i,
  "tree nuts": /\b(marzipan|praline|praliné|gianduja|nougat|pesto|almonds?|hazelnuts?|filberts?|walnuts?|cashews?|pecans?|pistachios?|macadamias?|brazil nuts?|pine nuts?|chestnuts?)\b/i,
  fish: /\b(surimi|anchov(y|ies)|cod|salmon|tuna|haddock|sardines?|pollock|tilapia|trout|bass|worcestershire)\b/i,
  crustaceans: /\b(shrimps?|prawns?|crab|crabmeat|lobster|crayfish|crawfish|scampi|langoustines?|krill)\b/i,
  molluscs: /\b(oysters?|mussels?|clams?|scallops?|squid|calamari|octopus|snails?|escargot|abalone|cockles?|whelks?)\b/i,
  sesame: /\b(tahini|tahina|benne|gomashio|gingelly|sesame|sesamol|til)\b/i,
  sulphites: /\b(sulphites?|sulfites?|bisulfites?|metabisulfites?|sulphur dioxide|sulfur dioxide|e22[0-8])\b/i,
  mustard: /\b(mustard|senf|moutarde)\b/i,
  celery: /\b(celery|celeriac|celery seed)\b/i,
  lupin: /\b(lupin|lupine|lupini)\b/i,
};

type Row = Record<string, string>;
let header: string[] = [];
let n = 0, nEn = 0;
const counts: Record<string, { tagged: number; fullClear: number; textClear: number; hiddenHit: number; hiddenClear: number }> = {};
const gapsFull: string[] = [], gapsHidden: string[] = [], textMisses: string[] = [];
const cnt = (k: string) => (counts[k] ??= { tagged: 0, fullClear: 0, textClear: 0, hiddenHit: 0, hiddenClear: 0 });

const rl = createInterface({ input: createReadStream(csvPath).pipe(createGunzip()), crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!header.length) { header = line.split("\t"); return; }
  n++;
  const f = line.split("\t"); const r: Row = {}; header.forEach((h, i) => (r[h] = f[i] ?? ""));
  const text = (r.ingredients_text || "").trim();
  if (!text) return;
  const lang = (r.lang || "").toLowerCase();
  if (lang && lang !== "en") return;
  if (!lang && !/\b(the|and|of|with|from|contains|flour|sugar|salt|water|oil)\b/i.test(text)) return;
  nEn++;
  const allergensTags = (r.allergens_tags || r.allergens_en || r.allergens || "").split(",").map(norm).filter(Boolean);
  const tracesTags = (r.traces_tags || r.traces_en || r.traces || "").split(",").map(norm).filter(Boolean);
  const full = { found: true, allergensTags, tracesTags, ingredientsText: text };
  const textOnly = { found: true, allergensTags: [], tracesTags: [], ingredientsText: text };
  const name = (r.product_name || "").slice(0, 60).replace(/\s+/g, " ");

  // Check 1: OFF tag says allergen; does CircleBite warn?
  for (const t of allergensTags) {
    const pname = TAG_TO_NAME[t]; if (!pname) continue;
    const c = cnt(pname); c.tagged++;
    const mf = matchAllergen(pname, full);
    if (!mf.matched) { c.fullClear++; gapsFull.push([r.code, pname, t, name, text.slice(0, 160)].join("\t")); }
    const mt = matchAllergen(pname, textOnly);
    if (!mt.matched) { c.textClear++; if (textMisses.length < 20000) textMisses.push([r.code, pname, name, text.slice(0, 200)].join("\t")); }
  }
  // Check 2: hidden name in text; does CircleBite warn (full product)?
  for (const [pname, re] of Object.entries(HIDDEN)) {
    const m = text.match(re); if (!m) continue;
    const c = cnt(pname); c.hiddenHit++;
    const mf = matchAllergen(pname, full);
    if (!mf.matched) { c.hiddenClear++; if (gapsHidden.length < 50000) gapsHidden.push([r.code, pname, m[0].toLowerCase(), name, text.slice(0, 160)].join("\t")); }
  }
  if (n % 200000 === 0) console.error(`rows ${n} english ${nEn}`);
});
rl.on("close", () => {
  const summary = { rows: n, englishWithIngredients: nEn, perAllergen: counts, gapsFull: gapsFull.length, gapsHidden: gapsHidden.length };
  writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 1));
  writeFileSync(`${outDir}/gaps-tagged-but-clear.tsv`, "code\tallergen\toff_tag\tname\tingredients\n" + gapsFull.join("\n"));
  writeFileSync(`${outDir}/gaps-hidden-name-but-clear.tsv`, "code\tallergen\tword\tname\tingredients\n" + gapsHidden.join("\n"));
  writeFileSync(`${outDir}/text-only-misses.tsv`, "code\tallergen\tname\tingredients\n" + textMisses.join("\n"));
  console.error("DONE", JSON.stringify(summary));
});
