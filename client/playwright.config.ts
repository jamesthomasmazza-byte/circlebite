import { defineConfig } from "@playwright/test";

// Browser tests for the client, against the Vite dev server with every /api call stubbed in the
// test itself (no server, no database). Added 2026-11-10 for the Scan page's two-barcode sequence,
// which the source-level tests in src/ can't drive. Runs the Mac's installed Google Chrome, so no
// browser download is needed: `npm run test:e2e` in client/.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
    headless: true,
    // A camera the scanner can open, so "Scan another product" behaves as on a phone.
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
    permissions: ["camera"],
  },
  webServer: {
    command: "npx vite --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
