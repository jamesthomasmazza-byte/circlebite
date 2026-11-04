// Writes the one-page judge card to docs/judges/judge-card.html (docs/judge-card-plan.md §3).
// From the repo root:
//   node_modules/.bin/tsx scripts/judge-card.ts
// Then open the file in a browser and print it, or save it as a PDF. Rerun after any change to
// client/src/judgeCard/; its tests keep the barcode and the wording in step with the seed and
// JUDGES.md.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderJudgeCard } from "../client/src/judgeCard/judgeCard.ts";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/judges/judge-card.html");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, renderJudgeCard());
console.log(`Wrote ${out}`);
