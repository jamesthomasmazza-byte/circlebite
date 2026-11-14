import { pool } from "./pool.js";
import { backfillProductImages } from "../lib/backfillImages.js";

// One-off (JT, Nov 14): give product rows saved before migration 0052 their Open Food Facts front
// image, 4 seconds apart, image fields only (lib/backfillImages.ts). Prints counts only. Run from the
// live release with the box's .env (docs/server-setup.md §11j):
//
//   ( set -a; source ~/circlebite/.env; set +a; node server/dist/db/backfillProductImages.js )

const PAUSE_MS = 4000;

backfillProductImages(PAUSE_MS)
  .then((counts) => {
    console.log(`products without a front image (found, not seeded): ${counts.candidates}`);
    console.log(`updated: ${counts.updated}`);
    console.log(`no image on Open Food Facts: ${counts.no_image}`);
    console.log(`not found on Open Food Facts: ${counts.not_found}`);
    console.log(`failed (left for the next scan): ${counts.failed}`);
  })
  .catch((err) => {
    console.error("backfill failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
