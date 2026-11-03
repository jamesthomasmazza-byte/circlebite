// The three matcher fixes of Oct 30 – Nov 3, measured together: the matcher before the first of them
// (7ed5b0a^) against today's, over the same Open Food Facts sample. For each product and each
// synonym cluster, a profile with that one allergen (traces not treated as unsafe, the default);
// a row for every product that read clear before and now warns. Written for
// 2026-11-03-matcher-before-after.md, which has the run's numbers and how to fetch the sample.
//
// From the repo root:
//   OLD=$(mktemp -d)
//   git show 7ed5b0a^:server/src/matcher/match.ts > "$OLD/match.ts"
//   git show 7ed5b0a^:server/src/matcher/synonyms.ts > "$OLD/synonyms.ts"
//   node_modules/.bin/tsx docs/evidence/2026-11-03-matcher-before-after.ts "$OLD" <sample-dir>... > rows.tsv
//
// Each sample directory holds Open Food Facts search responses (JSON with a `products` array);
// a file that isn't one is skipped. Tags are normalized as server/src/lib/openFoodFacts.ts does.

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { computeVerdict as computeNow } from "../../server/src/matcher/match.ts";
import { SYNONYM_CLUSTERS as CLUSTERS_NOW } from "../../server/src/matcher/synonyms.ts";

/** Known false cautions among the new warnings: a wrong Open Food Facts tag the matcher trusts. */
const KNOWN_FALSE: Record<string, string> = {
  "5016084000374": "sulphite", // Nutritional Yeast Flakes: tagged sulphites, text says "Zinc sulfate"
};

type Product = { code: string; product_name?: string; ingredients_text?: string; allergens_tags?: string[]; traces_tags?: string[] };

const normalizeTag = (tag: string) => tag.replace(/^[a-z]{2}:/i, "").toLowerCase().replace(/-/g, " ");

async function main() {
  const [oldDir, ...sampleDirs] = process.argv.slice(2);
  if (!oldDir || sampleDirs.length === 0) throw new Error("usage: <old-matcher-dir> <sample-dir>...");
  const { computeVerdict: computeBefore } = await import(pathToFileURL(resolve(oldDir, "match.ts")).href);
  const { SYNONYM_CLUSTERS: CLUSTERS_BEFORE } = await import(pathToFileURL(resolve(oldDir, "synonyms.ts")).href);

  const byCode = new Map<string, Product>();
  for (const dir of sampleDirs) {
    for (const file of readdirSync(dir)) {
      try {
        for (const p of JSON.parse(readFileSync(join(dir, file), "utf8")).products as Product[]) byCode.set(p.code, p);
      } catch {
        // an error page saved by a rate-limited request, not a search response
      }
    }
  }
  const products = [...byCode.values()]
    .map((p) => ({
      p,
      data: {
        found: true,
        allergensTags: (p.allergens_tags ?? []).map(normalizeTag),
        tracesTags: (p.traces_tags ?? []).map(normalizeTag),
        ingredientsText: p.ingredients_text?.trim() || null,
      },
    }))
    .filter(({ data }) => data.allergensTags.length > 0 || data.tracesTags.length > 0 || data.ingredientsText);

  const rows: string[] = [];
  const distinct = new Set<string>();
  const byCluster = new Map<string, Set<string>>();
  let pairs = 0;
  let toContains = 0;
  let knownFalse = 0;
  for (const { p, data } of products) {
    for (const cluster of CLUSTERS_NOW) {
      const name = cluster.aliases[0];
      // The key a pick-list choice carries; a cluster the old build didn't have gets none.
      const oldKey = (CLUSTERS_BEFORE as { id: string }[]).some((c) => c.id === cluster.id) ? cluster.id : null;
      const before = computeBefore([{ name, severity: "severe", treatTracesAsUnsafe: false, key: oldKey }], data).matchedAllergens[0];
      const now = computeNow([{ name, severity: "severe", treatTracesAsUnsafe: false, key: cluster.id }], data).matchedAllergens[0];
      if (before.classification !== "clear" || now.classification === "clear") continue;
      pairs++;
      if (now.classification === "contains") toContains++;
      const falseCaution = KNOWN_FALSE[p.code] === cluster.id;
      if (falseCaution) knownFalse++;
      distinct.add(p.code);
      if (!byCluster.has(cluster.id)) byCluster.set(cluster.id, new Set());
      byCluster.get(cluster.id)!.add(p.code);
      rows.push([cluster.id, now.classification, now.source, p.code, (p.product_name ?? "").replace(/\s+/g, " "), falseCaution ? "known false caution" : ""].join("\t"));
    }
  }

  console.log(`# products with data: ${products.length}`);
  console.log(`# distinct products that read clear and now warn: ${distinct.size}`);
  console.log(`# by allergen: ${[...byCluster].map(([id, codes]) => `${id} ${codes.size}`).join(", ")}`);
  console.log(`# product–allergen pairs: ${pairs}, of them Contains: ${toContains}, May contain: ${pairs - toContains}`);
  console.log(`# known false cautions among them: ${knownFalse}`);
  console.log(["allergen", "now", "source", "barcode", "product_name", "note"].join("\t"));
  for (const row of rows) console.log(row);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
