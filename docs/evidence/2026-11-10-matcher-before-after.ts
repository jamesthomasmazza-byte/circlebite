// The hidden-allergen words of 2026-11-10, measured: the matcher just before them against today's,
// over every product in the full Open Food Facts CSV export with English ingredient text. For each
// product and each synonym cluster, a profile with that one allergen (traces not treated as unsafe,
// the default). Three counts, all in one pass:
//   - pairs that read clear before and warn now (by allergen, and by the word that fired) — the rows;
//   - pairs that warned before and read clear now — must be 0;
//   - pairs that were Contains before and are May contain now — must be 0.
// Written for 2026-11-10-matcher-before-after.md, which has the run's numbers.
//
// From the repo root (the export is ~1.5 GB gzipped, docs/evidence/2026-11-10-off-full-audit.md says
// where it comes from; the run takes about 20 minutes):
//   OLD=$(mktemp -d)
//   git show ab949a3:server/src/matcher/match.ts > "$OLD/match.ts"
//   git show ab949a3:server/src/matcher/synonyms.ts > "$OLD/synonyms.ts"
//   node_modules/.bin/tsx docs/evidence/2026-11-10-matcher-before-after.ts "$OLD" \
//     ~/Downloads/en.openfoodfacts.org.products.csv.gz > rows.tsv
//
// The export has no language column, so a product counts as English the way the audit's audit.ts
// (next to this file) counted it: it has ingredient text containing a common English word. Tags are
// taken from the `allergens_en` and `traces_en` columns and normalized as server/src/lib/openFoodFacts.ts
// does. The TSV committed next to this file is the first 2,000 rows by barcode, with a short slice
// of each product's text so the over-warns can be read.

import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { createGunzip } from "node:zlib";

import { computeVerdict as computeNow } from "../../server/src/matcher/match.ts";
import { SYNONYM_CLUSTERS as CLUSTERS_NOW } from "../../server/src/matcher/synonyms.ts";

// ROW_CAP=0 in the environment writes every row, for reading the over-warns; the committed TSV is the capped run.
const ROW_CAP = process.env.ROW_CAP === undefined ? 2000 : Number(process.env.ROW_CAP) || Infinity;
const ENGLISH = /\b(the|and|of|with|from|contains|flour|sugar|salt|water|oil)\b/i;

const normalizeTag = (tag: string) => tag.replace(/^[a-z]{2}:/i, "").toLowerCase().replace(/-/g, " ").trim();
const splitTags = (cell: string) => cell.split(",").map(normalizeTag).filter(Boolean);

type Detail = { classification: "contains" | "caution" | "clear"; source: string | null; matchedText?: string };
type Compute = (allergens: { name: string; severity: "severe"; treatTracesAsUnsafe: boolean; key: string | null }[], product: unknown) => { matchedAllergens: Detail[] };

async function main() {
  const [oldDir, csvPath] = process.argv.slice(2);
  if (!oldDir || !csvPath) throw new Error("usage: <old-matcher-dir> <products.csv.gz>");
  const { computeVerdict: computeBefore } = (await import(pathToFileURL(resolve(oldDir, "match.ts")).href)) as { computeVerdict: Compute };
  const { SYNONYM_CLUSTERS: CLUSTERS_BEFORE } = (await import(pathToFileURL(resolve(oldDir, "synonyms.ts")).href)) as { SYNONYM_CLUSTERS: { id: string }[] };
  const oldIds = new Set(CLUSTERS_BEFORE.map((c) => c.id));

  let header: string[] = [];
  let col: Record<string, number> = {};
  let rows = 0;
  let english = 0;
  let newWarnings = 0;
  let newContains = 0;
  let lostWarnings = 0;
  let downgraded = 0;
  const distinct = new Set<string>();
  const byCluster = new Map<string, number>();
  const byWord = new Map<string, number>();
  const lost: string[] = [];
  const kept: [string, string][] = []; // [barcode, row], sorted and capped at the end

  const rl = createInterface({ input: createReadStream(csvPath).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) {
    if (header.length === 0) {
      header = line.split("\t");
      col = Object.fromEntries(header.map((h, i) => [h, i]));
      for (const needed of ["code", "product_name", "ingredients_text", "allergens_en", "traces_en"]) {
        if (!(needed in col)) throw new Error(`no ${needed} column in the export`);
      }
      continue;
    }
    rows++;
    if (rows % 500000 === 0) console.error(`rows ${rows}, english ${english}, new warnings ${newWarnings}`);
    const f = line.split("\t");
    const text = (f[col.ingredients_text] ?? "").trim();
    if (!text || !ENGLISH.test(text)) continue;
    english++;
    const code = f[col.code] ?? "";
    const name = (f[col.product_name] ?? "").replace(/\s+/g, " ").slice(0, 80);
    const data = { found: true, allergensTags: splitTags(f[col.allergens_en] ?? ""), tracesTags: splitTags(f[col.traces_en] ?? ""), ingredientsText: text };

    for (const cluster of CLUSTERS_NOW) {
      const allergen = cluster.aliases[0];
      // The key a pick-list choice carries; a cluster the old build didn't have gets none.
      const before = computeBefore([{ name: allergen, severity: "severe", treatTracesAsUnsafe: false, key: oldIds.has(cluster.id) ? cluster.id : null }], data).matchedAllergens[0];
      const now = computeNow([{ name: allergen, severity: "severe", treatTracesAsUnsafe: false, key: cluster.id }], data).matchedAllergens[0];
      if (before.classification === now.classification) continue;
      if (now.classification === "clear") {
        lostWarnings++;
        lost.push([cluster.id, before.classification, code, name].join("\t"));
        continue;
      }
      if (before.classification === "contains") {
        downgraded++;
        lost.push([cluster.id, "contains->caution", code, name].join("\t"));
        continue;
      }
      // Clear before, warns now (caution->contains can't happen: both builds read the same tags).
      newWarnings++;
      if (now.classification === "contains") newContains++;
      distinct.add(code);
      byCluster.set(cluster.id, (byCluster.get(cluster.id) ?? 0) + 1);
      const word = now.source === "ingredients" ? (now.matchedText ?? "").toLowerCase() : now.source === "tag" ? "(allergen tag)" : "(trace tag)";
      byWord.set(`${cluster.id}:${word}`, (byWord.get(`${cluster.id}:${word}`) ?? 0) + 1);
      kept.push([code, [cluster.id, now.classification, now.source, word, code, name, text.replace(/\s+/g, " ").slice(0, 120)].join("\t")]);
    }
  }

  const sortedWords = [...byWord].sort((a, b) => b[1] - a[1]);
  console.log(`# rows in the export: ${rows}`);
  console.log(`# products with English ingredient text: ${english}`);
  console.log(`# product–allergen pairs that read clear before and warn now: ${newWarnings}, of them Contains: ${newContains}, May contain: ${newWarnings - newContains}`);
  console.log(`# distinct products among them: ${distinct.size}`);
  console.log(`# by allergen: ${[...byCluster].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(", ")}`);
  console.log(`# by word: ${sortedWords.map(([w, n]) => `${w} ${n}`).join(", ")}`);
  console.log(`# pairs that warned before and read clear now (must be 0): ${lostWarnings}`);
  console.log(`# pairs that moved Contains -> May contain (must be 0): ${downgraded}`);
  for (const row of lost) console.log(`# LOST\t${row}`);
  console.log(`# rows below: the first ${Math.min(ROW_CAP, kept.length)} of ${kept.length} by barcode`);
  console.log(["allergen", "now", "source", "word", "barcode", "product_name", "ingredients_start"].join("\t"));
  kept.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (const [, row] of kept.slice(0, ROW_CAP)) console.log(row);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
