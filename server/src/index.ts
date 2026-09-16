import { createApp } from "./app.js";
import { env } from "./env.js";
import { runScanRetentionPurge } from "./jobs/scanRetention.js";

const app = createApp();

// Explicit localhost binding, not all interfaces: nginx (or, in dev, Vite) is the only thing
// that should ever reach this process. The security group already blocks external access to
// this port in production, but the app shouldn't depend on that alone.
app.listen(env.port, "127.0.0.1", () => {
  console.log(`circlebite server listening on 127.0.0.1:${env.port} (${env.nodeEnv})`);
});

// No cron or systemd timer on this box (docs/server-setup.md), so the 24-month scan-retention job
// (docs/coppa.md §2.7) runs in-process instead, riding the one guarantee this app already depends
// on for everything else — systemd's Restart=always on circlebite.service. Run once immediately so
// a restart (deploy or crash) doesn't leave a multi-day gap, then daily after that. The try/catch
// is deliberately around the whole callback, not just inside runScanRetentionPurge() (which already
// catches its own errors and records them) — a promise rejection here would otherwise be an
// unhandled rejection that could silently kill future ticks.
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function tickScanRetention(): Promise<void> {
  try {
    await runScanRetentionPurge();
  } catch (err) {
    console.error("scan retention tick failed unexpectedly", err);
  }
}

void tickScanRetention();
setInterval(tickScanRetention, ONE_DAY_MS);
