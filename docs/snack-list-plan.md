# Snack lists — plan (Nov 13, 2026; build by the Nov 16 freeze)

**Why now.** Suggested out loud by the judge who funds the award (told to JT, Nov 13). JT decided the
same day to build it for the final submission, with the shopping links working and the affiliate
income **not** working by Monday. It also widens the product: the same list serves families with no
allergies (snacks for playdates, picky eaters), on the same circle flow.

**What it is.** Each profile gets a snack list its owner and co-managers build from scans. Everyone in
the profile's circle sees it, with each item's **current** verdict and a way to shop for it. The person
holding the package often isn't the parent; this gives the friend's parent or grandma the list before
the playdate, not just a scanner at the shelf.

## Decisions (JT, Nov 13)

1. **Items are added from a scan's verdict card only** ("Add to Maya's snacks"), so every item is one
   exact barcode. No free-text items.
2. **Any verdict can be added, after a warning.** JT's reason: the barcode data can be wrong. "Contains
   an allergen" and "May contain" need a confirm step and keep their warning on the list for good.
   **On a "Contains" item the Shop buttons are hidden**, and the item shows "Label wrong? Report a
   correction", which opens the existing correction flow. An approved correction changes the verdict,
   and the buttons come back by themselves.
3. **Never the word "safe."** The list is "Maya's snacks", each item "approved by James, Nov 13". The
   app escalates and never clears (`docs/verdict-engine.md`); a list doesn't change that.
4. **Verdicts are live.** Each item shows its verdict against the profile's allergens **as they are
   now**. An allergen added later flags the items it now catches, at the top of the list. Viewing the
   list makes **no new AI call**: it uses the same deterministic path as a scan on the stored product
   data. Where that can't give a verdict, the item says "Unable to confirm" (fail closed).
5. **Circle members only.** Owner and co-managers add, remove and write notes; followers read. No share
   link for people outside the circle before judging: that would be a new way in with no login.
6. **Families with no allergies use the same flow.** The guided setup gets a third choice, "No allergies
   — just snack lists", which makes a profile with no allergens (skipping that step). Its items read "No
   listed allergens found". Copy on the list never assumes an allergy.
7. **A fourth tab, Snacks**, after Circle. It uses the same "Scanning for" pill as Scan (`ScanPill.tsx`)
   and the **same chosen profile the shell already holds**, so moving between Scan and Snacks keeps the
   same child. With one profile, the pill is just words. The profile page gets a "Snacks →" link to it.
8. **Shopping.** Each item has **Shop on Amazon** and **Shop on Instacart**: plain search links by
   product name and brand, by barcode only when the record has no name (JT, Nov 13), opened in a new
   tab. No API, no key, no product matching claimed. Every item shows "Scan it when it arrives — stores
   can send a different version." Whoever checks out gets the delivery, so a circle member shopping from
   the list ships it to their own house. The server omits the links for a "Contains" item; the client
   never receives them.
9. **Affiliate income later, wired now.** `AMAZON_ASSOCIATE_TAG` is read from the environment, **blank
   by default**, appended to the Amazon link only when set, and documented in `.env.example` with no
   value. Commissions never touch verdicts or list order. The disclosure line appears only once a tag is
   set. Instacart affiliate tracking runs through Impact redirect links, not a query parameter, so
   nothing is wired for it; that waits on the program's terms after judging.
10. **Behind `SNACK_LIST`, off by default.** Off: no Snacks tab (the bar is the three tabs already
    checked on JT's iPhone), no "Add to" button, and the API returns 404.

## Rules check (`CONTEST_RULES.md`, `AGENTS.md`)

- No hosted backend: outbound links only; data in the project's own Postgres.
- No secrets: the affiliate settings are blank and live in `.env` on the box only.
- §7 out of scope: none touched (no native build, no deep scan history, no new admin analytics).
- Freeze: built, deployed and checked on production **before** the reseed; nothing redeploys after.

## Build order (one logical change per commit)

1. Migration: `snack_list_items` — `id`, `profile_id` → `allergen_profiles`, `product_id` →
   `products`, `added_by` → `users`, `note` (short, optional), `created_at`; unique
   (`profile_id`, `product_id`); cascades with the profile and with account deletion.
2. `SNACK_LIST` switch in `env.ts` and on `GET /api/features` (and `/me` if that's where the others are).
3. Server: list, add, remove, edit note; permission tests (follower can read, can't write; stranger 404;
   switch off 404; judge-link session confined to its world, like everything else).
4. Verdict for a list item from stored data, no AI call; tests that a later allergen flags an item and
   that "Contains" hides the shop links.
5. Shop links builder (pure function) with tests: barcode first, name fallback, tag only when set.
6. Client: "Add to <name>'s snacks" on the verdict card, with the warning confirm for Contains / May
   contain.
7. Client: the Snacks tab, the pill, the list, empty state, "Label wrong? Report a correction".
8. Guided setup: the "No allergies — just snack lists" choice.
9. Profile page: the "Snacks →" link.
10. Judge seed: two or three items on Maya's list in every judge world (one with a note); `JUDGES.md`
    and the judge-link landing unchanged otherwise.
11. Docs: `docs/server-setup.md` (switch, rollback), `docs/principles.md` row, README line, journal.

Checked locally at 390×844 and 1280 wide, light and dark, 100/125/150% text, as judge1 on the judge
seed, before any deploy.

## Gate

**Sunday Nov 15, noon ET.** If it isn't built, deployed with the switch off, phone-checked and switched
on by then, it stays off and becomes the roadmap slide. The reseed, the judge link and the final email
don't move for it.

## After judging

Affiliate approval (Amazon Associates; Instacart Developer Platform, which can build a whole cart from
one list), a share link for people outside the circle, other diets (diabetes and others, which bring
medical claims and need their own review).
