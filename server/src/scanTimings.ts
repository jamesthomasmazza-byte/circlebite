// Reads the journal on stdin and prints p50/p90 per scan path (lib/scanTimingSummary.ts). Run by JT
// from the Mac, `docs/server-setup.md` §8b:
//   ssh … "journalctl -u circlebite --since -2days -o cat --no-pager" | npm run -s timings -w server

import { formatSummary, summarizeTimings } from "./lib/scanTimingSummary.js";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
process.stdout.write(formatSummary(summarizeTimings(Buffer.concat(chunks).toString("utf8"))));
