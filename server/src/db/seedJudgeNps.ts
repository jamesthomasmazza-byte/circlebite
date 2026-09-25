// Placeholder scoped only to nps_responses. BACKLOG.md's judge seed script (invented
// families/profiles/circle members) doesn't exist yet — this fills the one gap that would
// otherwise leave the NPS admin page (CONTEST_RULES.md §7 exception) empty during judging.
// Fold this into the real judge seed script once that's built.
//
// Rows are invented feedback with user_id = NULL and source = 'seed' (migration 0024) — NULL
// sidesteps needing to fabricate synthetic user accounts that don't exist yet, and `source` is
// the real, load-bearing marker that these aren't genuine responses (see that migration's
// comment: a NULL user_id alone can't tell "real, now-anonymous" apart from "never real").
//
// Rerunnable: a fixed, deterministic set of ids (the "5eed0000-" prefix — valid hex, reads as
// "seed" — matching this repo's test-fixture convention of a recognizable id prefix per file) is
// deleted before every insert, so running this script twice leaves the same 24 rows rather than
// doubling them.

import { pool } from "./pool.js";

type SeedRow = { id: string; score: number; reason: string | null };

function id(n: number): string {
  return `5eed0000-0000-0000-0000-${String(n).padStart(12, "0")}`;
}

// 15 promoters, 5 passives, 4 detractors — n = 24, clears NPS_SMALL_SAMPLE_THRESHOLD (20) so the
// admin page shows a real score, not the small-n message. Some reasons, some not, all invented
// (AGENTS.md — no real feedback on the contest deployment).
const SEED_ROWS: SeedRow[] = [
  { id: id(1), score: 10, reason: "The circle is exactly what my family needed." },
  { id: id(2), score: 10, reason: "Finally an app that admits when it doesn't know." },
  { id: id(3), score: 10, reason: null },
  { id: id(4), score: 10, reason: "My mother-in-law can scan for the kids now." },
  { id: id(5), score: 9, reason: "Love that the disclaimer is always right there." },
  { id: id(6), score: 9, reason: null },
  { id: id(7), score: 9, reason: "Corrections actually feel like they go somewhere." },
  { id: id(8), score: 9, reason: null },
  { id: id(9), score: 10, reason: "Simple, and it doesn't pretend to know more than it does." },
  { id: id(10), score: 9, reason: null },
  { id: id(11), score: 10, reason: "The severity levels per allergen are a big deal for us." },
  { id: id(12), score: 9, reason: null },
  { id: id(13), score: 10, reason: "Invite flow for the babysitter took thirty seconds." },
  { id: id(14), score: 9, reason: "Would like a scan history longer than a handful." },
  { id: id(15), score: 10, reason: null },
  { id: id(16), score: 8, reason: "Camera scanning is a little slow to focus." },
  { id: id(17), score: 7, reason: null },
  { id: id(18), score: 8, reason: "Wish I could see more than the last few scans." },
  { id: id(19), score: 7, reason: "Good, just wish the app remembered my usual profile." },
  { id: id(20), score: 8, reason: null },
  { id: id(21), score: 4, reason: "Too many taps to report a wrong ingredient." },
  { id: id(22), score: 3, reason: null },
  { id: id(23), score: 5, reason: "Unable to confirm too often for common products." },
  { id: id(24), score: 2, reason: "Wanted a health score, not a yes/no." },
];

async function seedJudgeNps(): Promise<void> {
  try {
    const ids = SEED_ROWS.map((r) => r.id);
    await pool.query("DELETE FROM nps_responses WHERE id = ANY($1)", [ids]);

    for (const row of SEED_ROWS) {
      await pool.query(
        `INSERT INTO nps_responses (id, user_id, score, reason, source) VALUES ($1, NULL, $2, $3, 'seed')`,
        [row.id, row.score, row.reason],
      );
    }

    console.log(`seeded ${SEED_ROWS.length} judge nps_responses rows`);
  } finally {
    await pool.end();
  }
}

seedJudgeNps().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
