# Legacy spec — what the prototype does

A written description of the earlier CircleBite prototype (built on Lovable, disclosed to and cleared
by Prof. Yoest on 2026-09-08). This is **design reference, re-implemented from scratch** — the
arrangement he approved. No code from that project is copied into this repository.

Point Claude Code at a section: *"build the circle invite flow per `docs/legacy-spec.md` §5."*

Everything here was validated by real alpha testers, so treat it as a settled design rather than a
first draft — but see §7 for what deliberately changes.

---

## 1. Product flows

Seventeen routes in the prototype. Public first, then authenticated.

**Public**

- `/` — marketing landing page. Explains the problem, features, how it works. If launched as an
  installed PWA, redirects straight to the dashboard instead.
- `/auth` — sign in and sign up.
- `/reset-password` — password reset.
- `/follow/:token` — accept a **follow** invite (view a profile, scan on its behalf).
- `/co-manager/:token` — accept a **co-manager** invite (full edit rights on a profile).

**Authenticated** (all behind a route guard that checks the session before load)

- `/dashboard` — entry point. Profiles you manage, profiles you follow, recent scans.
- `/scan` — the core screen. Camera barcode scanner, manual barcode entry, profile picker, verdict
  card, correction actions.
- `/profiles/new` — create an allergen profile.
- `/profiles/:id` — view and edit a profile: label, notes, allergens, severities, trace handling.
- `/profiles/:id/history` — scan history for that profile.
- `/circle` — who follows your profiles, who you follow, pending invites, revoke access.
- `/follows/:id` — detail on one follow relationship.
- `/settings` — account settings, install-as-app prompt.
- `/admin` — analytics dashboard (owner only).

**The scan flow specifically** — this is the heart of the app:

1. Pick which profile you're scanning for (yours, or one you follow/co-manage).
2. Scan a barcode with the camera, or type it.
3. App fetches the product, cross-references against that profile's allergens.
4. Verdict card: safe / contains / may-contain-caution / unable to confirm, with the matched
   allergens named and a standing disclaimer.
5. From the card: report a correction, or confirm the verdict was accurate.

## 2. Data model

Eight tables. UUID primary keys throughout, `created_at`/`updated_at` timestamps.

**`profiles`** — one row per user account. `username` (unique), `display_name`, `avatar_url`,
`invite_token` (unique, random hex — the user's personal follow link).

**`allergen_profiles`** — a person whose allergies are being tracked. Not the same as a user account:
a parent has an account, each child has an allergen profile.
`manager_id` (owner), `label` ("Emma"), `is_self` (this profile is the account holder's own),
`notes`, `default_treat_traces_as_unsafe` (default true).

**`allergens`** — one row per allergen on a profile.
`allergen_profile_id`, `name`, `severity` (mild | moderate | severe), `notes`,
`treat_traces_as_unsafe` (per-allergen override; existing data was defaulted severe → true,
mild/moderate → false).

**`follow_relationships`** — someone granted view/scan access to a profile.
`follower_id`, `allergen_profile_id`, `status` (pending | accepted | revoked),
`share_level` (all | severe_only), `message`, `responded_at`.
Unique on (follower, profile).

**`profile_managers`** — someone granted *co-management* (edit) rights.
`allergen_profile_id`, `user_id`, `added_by`, `added_at`. Unique on (profile, user).

**`manager_invites`** — single-use co-manager invite links.
`token` (unique, 16 random bytes hex), `allergen_profile_id`, `created_by`, `revoked_at`.

**`scans`** — every scan performed.
`scanner_id`, `allergen_profile_id`, `barcode`, `product_name`, `product_brand`,
`product_image_url`, `ingredients_text`, `product_data` (raw JSON snapshot),
`product_last_updated`, `result`, `matched_allergens` (JSON).

Storing the raw product snapshot and its upstream last-modified date is what makes a verdict
reproducible later. **Keep this.** It also enables the staleness check in §7.

**`product_corrections`** — a user disputing a verdict.
`scan_id`, `barcode`, `reported_by`, `correction_type` (flag_wrong | flag_missing | wrong_product),
`allergen`, `direction` (add_caution | remove_caution), `photo_url` (required — a photo of the
label), `note`, `status` (pending | corroborated | rejected).

**`product_confirmations`** — a user affirming a verdict was right.
`barcode`, `allergen`, `confirmed_by`. Unique on (barcode, allergen, user).

**Authorization note for the rebuild.** The prototype relied on Postgres row-level security, which
came from the hosted platform. This build has no RLS layer — **every access check must be enforced in
application code**, on the server, on every query. A user may read a profile only if they own it, are
a co-manager, or have an accepted follow. This is the single biggest correctness risk in the port.

## 3. Allergen matching rules

A synonym table maps an allergen name to the keywords that indicate it. Several clusters are
bidirectional — any entry point matches the whole set.

- **Dairy cluster** — milk, dairy, lactose, whey, casein all map to the same keyword set.
- **Gluten cluster** — wheat, gluten, barley, rye, bidirectional.
- **Crustacean cluster** — shellfish, crustacean, shrimp, prawn, crab, lobster, bidirectional.
- **Peanut is deliberately separate from tree nuts.** Different allergen; conflating them is a real
  safety error.
- **Tree nuts** — the umbrella matches almond, hazelnut, walnut, cashew, pecan, pistachio, brazil
  nut, macadamia; each individual nut also has its own narrow entry.
- Egg → egg, albumin, ovalbumin. Soy → soy, soya, soybean, edamame, tofu.
- Fish → named species (cod, salmon, tuna, anchovy, sardine, haddock).
- Molluscs → oyster, mussel, clam, scallop, squid, octopus.
- Sesame → sesame, tahini. Celery → celery, celeriac. Lupin → lupin, lupine.
- Sulphites → both spellings, plus sulphur/sulfur dioxide and **E220**.

Unknown allergen names fall through to a literal match on the name itself, with a trivial plural
strip (trailing "s") tried first.

**Matching order**, per allergen, first hit wins:

1. Structured allergen tags from the product record → source `tag`
2. Word-boundary regex against ingredient text → source `ingredients`
3. Trace / "may contain" tags → source `trace`, carrying the profile's `treat_traces_as_unsafe`

Tags are normalized before matching: strip the language prefix (`en:`), lowercase, hyphens to spaces.

## 4. Verdict taxonomy

Four states. The enum in the database has three; `may_contain_caution` was added later in
application code and should be a proper enum value in the rebuild.

| Verdict | When |
|---------|------|
| `safe` | No allergen matched, and the product record had usable data |
| `contains_allergen` | A direct hit (tag or ingredients), **or** a trace hit on an allergen the profile treats traces as unsafe |
| `may_contain_caution` | Only trace hits, on allergens where the profile tolerates traces |
| `unable_to_confirm` | Product not found, **or** found with no tags, no traces, and no ingredient text |

Note the fail-closed shape already present: an empty product record produces *unable to confirm*, not
*safe*. Preserve that.

**Community corrections adjust the verdict.** Corroborated `remove_caution` reports strip that
allergen from the matched list and the verdict is recomputed from the same rules. A corroborated
`wrong_product` report clears everything. The UI shows a transparency note naming what was cleared
and why — do not silently change a verdict.

## 5. Circle and invites

Two distinct grants, deliberately separate:

**Follow** — view a profile and scan on its behalf. Cannot edit. Created from the profile owner's
personal `invite_token` link. Has a `share_level`:

- `all` — the follower sees every allergen
- `severe_only` — the follower sees only severe allergens

`severe_only` exists because a parent may not want to hand a neighbour their child's full medical
picture, but does need them to know about the anaphylactic one.

Lifecycle: pending → accepted → revoked. The owner can revoke at any time from `/circle`.

**Co-manager** — full edit rights on a profile. Created from a single-use `manager_invites` token,
revocable via `revoked_at`. Intended for the second parent.

The distinction matters in the UI: a follower scanning sees a read-only profile picker; a co-manager
sees edit controls.

## 6. Corrections and confirmations

The trust loop. Users are the check on the product database, and (in the rebuild) on the model.

**Reporting a correction** requires a photo of the physical label — not optional. Three types:

| Type | Direction | Meaning |
|------|-----------|---------|
| `flag_wrong` | remove_caution | "You flagged an allergen that isn't in this product" |
| `flag_missing` | add_caution | "You missed an allergen that is in this product" |
| `wrong_product` | remove_caution | "This barcode returned the wrong product entirely" |

Status moves pending → corroborated (enough independent reports agree) or rejected.

**Confirmations** are the positive signal: a user affirming the verdict was right for a given barcode
and allergen. Unique per user so one person can't inflate the count.

## 7. What changes in the rebuild

Not a straight port. Four deliberate differences:

**Authorization moves into application code.** See §2. No RLS layer exists here.

**The AI verdict engine is new.** The prototype has no AI at any point — the matcher in §3 is the
whole engine. See `docs/verdict-engine.md`.

**Barcode plus label cross-reference** — the prototype trusts the product database completely. The
rebuild treats it as a claim to be checked against the physical package. See `verdict-engine.md` §1,
Path D. The `product_last_updated` field already stored in `scans` is the staleness signal that
decides when to ask for a label photo.

**Deferred until after judging** (`CONTEST_RULES.md` §7): the iOS/Capacitor wrapper, the admin
analytics dashboard beyond an AI accuracy page, and deep scan history. Everything else in this
document is in scope.
