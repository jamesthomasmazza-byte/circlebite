// The judge link (2026-11-07, Prof. Yoest's Nov 5 ask): /judge#<token> signs a judge in to an unused
// demo world (server auth/judgeLink.ts) and lands on Maya's card for the shared judge barcode.
//
// The token rides in the fragment, which a browser never sends in a request, so it reaches no server
// or nginx log; the page POSTs it and drops it from the address bar and the tab's back history first.
// The browser's own history still records the URL it opened, token included; no page can remove that
// (docs/server-setup.md §16a). Scan runs the card on the
// judge=1 flag alone, as it does the sample: a barcode is never read from the URL.

/** The seed's shared judge barcode (server db/seed/seedData.ts, PRODUCTS.circleReported). */
export const JUDGE_LINK_BARCODE = "2990000000083";

export const JUDGE_LINK_PATH = "/judge";

/** The token from the fragment, or null. Nothing else in the URL is read. */
export function judgeLinkToken(hash: string): string | null {
  const token = hash.startsWith("#") ? hash.slice(1) : hash;
  return /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : null;
}

/** Where a signed-in judge lands: Scan, on Maya, with the flag that scans the judge barcode once. */
export function judgeLinkLanding(profileId: string): string {
  return `/scan?profile=${encodeURIComponent(profileId)}&judge=1`;
}

/** Scan runs the judge card only on this flag. */
export function wantsJudgeCard(search: string): boolean {
  return new URLSearchParams(search).get("judge") === "1";
}

/** Every failure, whatever the cause: the server says only 404, and so does the page. */
export const JUDGE_LINK_NOT_FOUND = "Page not found";
