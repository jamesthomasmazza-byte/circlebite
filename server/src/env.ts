import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * `raw ?? fallback` looks equivalent to this but isn't: `??` only falls back on null/undefined,
 * not on an empty string — and an env var present in the file but left blank (exactly what
 * .env.example ships as its template for an optional numeric var) comes through as `""`, not
 * undefined. `Number("")` is 0, not NaN, so a blank AI_DAILY_SPEND_CAP_CENTS silently became a
 * real $0.00 cap that refused every AI call, not "no cap configured, use the default." Also falls
 * back on non-numeric garbage rather than propagating NaN, which would have the same silent-zero
 * failure mode (NaN comparisons are always false).
 */
export function parseOptionalCents(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * An on/off switch read from the environment. Blank or unset falls back (same blank-string trap as
 * parseOptionalCents above); anything other than "on"/"off" throws at startup rather than guessing —
 * a typo'd kill switch that silently resolved to the wrong state is exactly the failure a kill
 * switch exists to prevent.
 */
export function parseSwitch(name: string, raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = raw.trim().toLowerCase();
  if (value === "on") return true;
  if (value === "off") return false;
  throw new Error(`${name} must be "on" or "off", got "${raw}"`);
}

/**
 * A moment read from the environment as an ISO 8601 date-time with its offset. Blank or unset falls
 * back; anything unparseable throws at startup, like parseSwitch: an expiry that silently resolved
 * to "never" is the failure it exists to prevent.
 */
export function parseInstant(name: string, raw: string | undefined, fallback: string): Date {
  const value = raw === undefined || raw.trim() === "" ? fallback : raw.trim();
  const at = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(at.getTime())) {
    throw new Error(`${name} must be an ISO date-time with an offset, like 2026-12-01T00:00:00-05:00, got "${value}"`);
  }
  return at;
}

/** A SHA-256 digest in hex, or undefined if unset. Anything else throws at startup. */
export function parseSha256Hex(name: string, raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = raw.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`${name} must be a SHA-256 digest: 64 hex characters`);
  return value;
}

/** A free-text setting, or undefined when unset or blank — the same blank-string trap as above. */
export function optionalTrimmed(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value ? value : undefined;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL"),
  sessionSecret: required("SESSION_SECRET"),
  offUserAgent: required("OFF_USER_AGENT"),
  // Optional, not required(): a missing key must not break every other scan type or local dev
  // without one. aiClient treats a missing key the same as any other call failure, so the
  // verdict engine's existing fail-closed path covers it rather than needing a second branch.
  aiApiKey: process.env.AI_API_KEY,
  aiModel: process.env.AI_MODEL ?? "claude-haiku-4-5-20251001",
  // In-app spend rail, on top of (not instead of) the console-side cap on the sandbox key itself.
  aiDailySpendCapCents: parseOptionalCents(process.env.AI_DAILY_SPEND_CAP_CENTS, 200),
  // Where correction photos land. required(), not defaulted: a path.join(process.cwd(), "uploads")
  // fallback looked reasonable but was a live bug — process.cwd() for the systemd service is
  // WorkingDirectory (~/circlebite/current/server), which scripts/release.sh repoints to a new
  // release on every deploy. A default landing there meant every correction photo — required
  // evidence for corroboration — was deleted the moment the *next* deploy ran, not eventually when
  // an old release got pruned. Found by checking the box directly (UPLOAD_DIR was never actually
  // set in ~/circlebite/.env, despite the comment here previously claiming production "must"
  // override the default) rather than trusting that the comment matched reality. Production must
  // point outside the versioned release tree (~/circlebite/uploads/, a sibling of releases/ and
  // current/ — see docs/server-setup.md §8); local dev needs its own explicit value too now, same
  // as every other required() var below.
  uploadDir: required("UPLOAD_DIR"),
  // Kill switch for community corrections reaching profiles other than the reporter's
  // (corrections/applyCommunityCorrections.ts). docs/principles.md principle 4: anything that can
  // change what a person is told must be undoable before it ships. Off by default so it ships dark
  // and gets turned on deliberately; flipping it off and restarting reverts every other profile's
  // view at once, with no data changes — scans.result always holds the engine's own verdict. A
  // reporter's own corrections (CONTEST_RULES.md §3) apply either way.
  communityCorrections: parseSwitch("COMMUNITY_CORRECTIONS", process.env.COMMUNITY_CORRECTIONS, false),
  // Kill switch for Path C (docs/verdict-engine.md) — photographing a label instead of scanning a
  // barcode. Same pattern and reasoning as COMMUNITY_CORRECTIONS above (principle 4): off by
  // default so it ships dark, and flipping it off makes POST /scans/label 404 again with no data
  // changes to revert — the route doesn't exist for a disabled feature, same posture as a feature
  // that was never built.
  labelScan: parseSwitch("LABEL_SCAN", process.env.LABEL_SCAN, false),
  // Kill switch for sharing a pending escalation with the rest of the reporter's circle — everyone
  // who can read the profile it was filed from, on every scan of that barcode
  // (corrections/circleEscalations.ts). Same pattern and reasoning as COMMUNITY_CORRECTIONS
  // (principle 4): off by default, and off means each pending report changes only its reporter's
  // view of the scan they filed it from, exactly as before. No data to revert either way.
  circleEscalations: parseSwitch("CIRCLE_ESCALATIONS", process.env.CIRCLE_ESCALATIONS, false),
  // Whether the camera scanner decodes only inside its target box rather than the whole frame
  // (client/src/BarcodeScanner.tsx, 2026-10-27). Same pattern as the switches above: off by
  // default, and off is the full-frame decoding that ran before it. Only the client reads it, via
  // GET /me; an admin's phone can override it for testing (client/src/lib/scannerRegion.ts).
  scannerRegion: parseSwitch("SCANNER_REGION", process.env.SCANNER_REGION, false),
  // Follow requests (routes/circleRequests.ts, 2026-10-27): asking to follow a parent by their
  // email address, for the owner to approve or decline. Same pattern as the switches above: off by
  // default, and off makes every request route 404 and hides the form, notice and badge. Requests
  // already waiting stay in the database, untouched, until it's on again.
  circleRequests: parseSwitch("CIRCLE_REQUESTS", process.env.CIRCLE_REQUESTS, false),
  // The guided profile setup (client routes/NewProfile.tsx, 2026-10-27): one question at a time,
  // answered by tapping, saved through the same POST /profiles. No AI and no third-party call. Off
  // by default; off, every "Add a profile" and "Create one" opens the classic form as before. Only
  // the client reads it, via GET /me.
  guidedSetup: parseSwitch("GUIDED_SETUP", process.env.GUIDED_SETUP, false),
  // Scan sounds (client lib/scanSounds.ts, 2026-11-05): a beep on a camera read, an alert for
  // "Contains an allergen", a softer one for "May contain", nothing for the other two. Generated in
  // the browser; nothing on the server depends on it. Off by default, and off hides the setting and
  // plays nothing. Only the client reads it, via GET /me.
  scanSounds: parseSwitch("SCAN_SOUNDS", process.env.SCAN_SOUNDS, false),
  // The redesigned Circle tab (client routes/CircleRedesign.tsx, 2026-11-06): a circle switcher, a
  // diagram, one list of members and pending invites, and sheets to add or open a member; plus a
  // follower's own "Leave" (POST /profiles/:id/leave, which 404s while this is off). Off by default,
  // and off is today's Circle tab, unchanged. The client reads it via GET /me.
  circleRedesign: parseSwitch("CIRCLE_REDESIGN", process.env.CIRCLE_REDESIGN, false),
  // The redesigned Scan tab (client routes/Scan.tsx, 2026-11-06): the camera as the screen, Scan's
  // own "Scanning for" pill in place of the header there, and results in a sheet over the camera.
  // A layout only: the verdict, its wording and every flow are the same either way. Off by default,
  // and off is today's Scan, unchanged. The client reads it via GET /me.
  scanRedesign: parseSwitch("SCAN_REDESIGN", process.env.SCAN_REDESIGN, false),
  // The redesigned Profile tab and profile page (client routes/Profiles.tsx and ProfileDetail.tsx,
  // 2026-11-06): profile rows with avatars, and a profile page with a header, stats and Allergens |
  // Scans | Changes tabs. A layout only; GET /profiles/:id/scan-count is the one route it adds, open
  // to anyone who can read the profile either way. Off by default, and off is today's pages. The
  // client reads it via GET /me.
  profileRedesign: parseSwitch("PROFILE_REDESIGN", process.env.PROFILE_REDESIGN, false),
  // Whether new accounts can be created (auth/routes.ts POST /register, 2026-11-06). Closed until
  // after judging at Prof. Yoest's ask of Nov 5: a friendly landing page would eventually draw a
  // real parent entering a real child's allergy (R9). Unlike the switches above, off is the
  // standard state, and the default, so an unset variable keeps sign-up closed. Sign-in, invites to
  // existing accounts and the judge seed are unaffected. The client reads it via GET /features.
  registration: parseSwitch("REGISTRATION", process.env.REGISTRATION, false),
  // The judge link (auth/judgeLink.ts, 2026-11-07, Prof. Yoest's Nov 5 ask): one URL that signs each
  // click in to an unused world from the seed's pool. Off by default, and unset is off. Off, or past
  // JUDGE_LINK_EXPIRES, the link is a plain 404 and every session it made stops working
  // (auth/session.ts). JUDGE_LINK_TOKEN_HASH is the SHA-256 of the link's token, made on the box
  // (docs/server-setup.md §16a); the token itself is never stored. Unset, no token matches.
  judgeLink: parseSwitch("JUDGE_LINK", process.env.JUDGE_LINK, false),
  judgeLinkExpires: parseInstant("JUDGE_LINK_EXPIRES", process.env.JUDGE_LINK_EXPIRES, "2026-12-01T00:00:00-05:00"),
  judgeLinkTokenHash: parseSha256Hex("JUDGE_LINK_TOKEN_HASH", process.env.JUDGE_LINK_TOKEN_HASH),
  // Snack lists (routes/snackList.ts, docs/snack-list-plan.md, 2026-11-13): each profile's list of
  // products approved from a scan's card, with each item's current verdict and shop links. Same
  // pattern as the switches above: off by default, and off makes every list route 404 and hides the
  // Snacks tab and the "Add to" button. Items already saved stay in the database until it's on
  // again. The client reads it via GET /me.
  snackList: parseSwitch("SNACK_LIST", process.env.SNACK_LIST, false),
  // Amazon Associates tag, appended to an item's Amazon search link only when set
  // (snackList/shopLinks.ts). Blank by default: no tag, no affiliate link, no disclosure line. It is
  // a public query parameter, not a secret, but it lives in .env on the box like every setting. It
  // never touches a verdict or the order of a list (plan decision 9).
  amazonAssociateTag: optionalTrimmed(process.env.AMAZON_ASSOCIATE_TAG),
};
