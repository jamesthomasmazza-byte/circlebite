// Local only: a co-manager's pending escalation, so the "Reported by your circle, not yet confirmed"
// card can be looked at in a browser (`npm run seed:circle-demo -w server`, after `seed:judge`).
//
// Priya Nair, Maya's co-manager in judge 1's cast, reports Peanut present on her Oat Biscuits scan.
// One family, so it stays pending. With CIRCLE_ESCALATIONS=on, judge1 — Maya's owner — sees it on
// that scan in Maya's history and on a fresh scan of the barcode (2990000000038).
//
// Never on production: there, a seeded account's report is a live warning, and the judge seed
// rejects any it finds anyway. Refuses to run with NODE_ENV=production.

import { recordCorrection } from "../corrections/recordCorrection.js";
import { savePhotoBuffer } from "../corrections/photoStorage.js";
import { env } from "../env.js";
import { PEOPLE, PRODUCTS, PROFILES, SCANS } from "./seed/seedData.js";
import { pool } from "./pool.js";

// A 1×1 grey PNG — stands in for the label photo the report form requires. Synthetic (R9).
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABc3UBGAAAAABJRU5ErkJggg==",
  "base64",
);

async function main(): Promise<void> {
  if (env.isProduction) {
    console.error("seed:circle-demo is for local development only — nothing was changed.");
    process.exitCode = 1;
    return;
  }

  const priya = PEOPLE.priya1;
  const maya = PROFILES.maya1;
  const scan = SCANS.find((s) => s.profile === "maya1" && s.scanner === "priya1" && s.product === "oatBiscuits");
  if (!scan) throw new Error("the judge seed no longer has Priya's Oat Biscuits scan of Maya");

  const { rows } = await pool.query("SELECT 1 FROM scans WHERE id = $1", [scan.id]);
  if (rows.length === 0) {
    console.error("Priya's Oat Biscuits scan isn't in this database — run `npm run seed:judge -w server` first.");
    process.exitCode = 1;
    return;
  }

  const existing = await pool.query<{ status: string }>(
    "SELECT status FROM product_corrections WHERE scan_id = $1 AND reported_by = $2 AND allergen = 'Peanut' AND direction = 'add_caution'",
    [scan.id, priya.id],
  );
  if (existing.rows[0]) {
    console.log(`Already filed (status: ${existing.rows[0].status}). To file it fresh, rerun seed:judge (it rejects the seeded accounts' reports and recreates the scan), then this.`);
    return;
  }

  const result = await recordCorrection({
    scanId: scan.id,
    reportedBy: priya.id,
    correctionType: "flag_missing",
    allergen: "Peanut",
    note: "Local demo: Peanut on the label photo, not in the product data.",
    photoPath: await savePhotoBuffer(PLACEHOLDER_PNG, "png"),
    origin: "user_initiated",
  });
  console.log(
    `${priya.displayName} (co-manager of ${maya.label}) reported Peanut present on ${PRODUCTS.oatBiscuits.name} ` +
      `(${PRODUCTS.oatBiscuits.barcode}) — status: ${result.status}.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
