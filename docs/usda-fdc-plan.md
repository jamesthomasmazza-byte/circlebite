# USDA FoodData Central as a second product source

Plan, November 4, 2026. No code. **Decided (JT, November 4): after judging, with no measurement
before it.** *November 7: the code freeze moved from November 13 to November 16, three days later. The
decision stands; the sizing below was not redone.*

## What it would add

Open Food Facts covers US products unevenly. USDA FoodData Central's Branded Foods dataset is label
data from US manufacturers: barcode (`gtin_upc`), description, brand and the ingredient statement.
It has no allergen tags, so the matcher would read its ingredient text only.

## Facts, checked November 4, 2026

From `fdc.nal.usda.gov/api-guide/` and `fdc.nal.usda.gov/download-datasets/`:
- **Licence:** "USDA FoodData Central data are in the public domain and they are not copyrighted,"
  published under CC0 1.0. No permission needed; USDA asks to be credited as the source.
- **API:**
  - Every request needs an api.data.gov key.
  - The default limit is 1,000 requests per hour per IP.
  - **No barcode lookup is documented.** The endpoints are by FDC id, a paged list, and keyword
    search. A barcode lookup would have to search by the GTIN and keep only an exact `gtinUpc`
    match. That has to be tested before anything is built on it.
- **Bulk download, Branded Foods:**
  - JSON: 187 MB zipped, about 3 GB unzipped.
  - CSV: 432 MB zipped, about 3 GB unzipped.
  - Latest release October 29, 2026. Releases come about **twice a year** (April and October),
    not monthly.

## The rules

- **R5 (own server).** Either way, the web server, the application and PostgreSQL stay on the EC2
  instance. With the bulk download, the data itself lives in our own Postgres.
- **R6 (no hosted backend services).**
  - **The API** is a public data source queried at scan time, the same kind of thing Open Food
    Facts already is. It isn't a managed database, managed auth or backend-as-a-service, and the
    app would run without it (the switch is off by default, and a failure only means no USDA data).
  - **The bulk download** has no runtime dependency at all.
  - Neither reintroduces a managed service.
- **R8 (no secrets).** The API key is a secret: `FDC_API_KEY` in the box's `.env`, empty in
  `.env.example`, never in a commit. `scripts/check-secrets.sh` should learn its shape. The bulk
  download needs no key.
- **R9 (synthetic data).** Product data only; nothing about a person goes to USDA or comes back. As
  with Open Food Facts, the API would learn which barcodes were scanned (principle 5). The bulk
  download sends nothing anywhere.

## API or bulk download

| | API | Bulk download |
|---|---|---|
| Barcode lookup | Search by GTIN, keep an exact match: **untested** | Exact match in our own table |
| Per scan | A second network call, run beside Open Food Facts', with its own timeout | A local query |
| Secret | The API key (R8) | None |
| On the box | A small cache table | A slimmed table, likely a few hundred MB (to measure) |
| Freshness | Live | Twice-yearly releases, re-imported by hand |
| Backups | Unchanged | The nightly dump grows from about 92 KiB to hundreds of MB, unless the table is left out of `pg_dump` (it can be re-imported). That's a backup-script change, so the §17.13 harness runs first |

**The box can't unpack 3 GB:** it's a t3.micro with 1 GiB RAM and 30 GiB disk. A bulk import would
be slimmed on the Mac, keeping barcode, description, brand, ingredients and release date, then
copied up and loaded with `COPY`.

**Recommendation:** the API first, to measure; the bulk download only if the measurement says keep
it. An exact local lookup is the better long-term design.

**Barcodes:** USDA's `gtin_upc` is mostly 12-digit UPC-A, while phones often read the same code as
a 13-digit EAN with a leading 0. Normalize both sides to GTIN-14 before matching.

## Merging with Open Food Facts

The non-negotiables (`docs/verdict-engine.md`) still hold: fail closed, and nothing clears what the
deterministic matcher found.

- **Per allergen, the more cautious of the two sources wins:** Contains over May contain over clear.
  A USDA miss, not-found, failure or timeout therefore never clears an Open Food Facts warning, by
  construction, and a test pins it.
- **The card says where each hit came from.** A new source label, "found in the USDA ingredient
  list — "milk"", with the matched text quoted from USDA's own text, as today.
- **The scan record stores which sources were used**, so history and the overrule log say what the
  card was based on.
- **The AI layer stays on Open Food Facts** at first. USDA is matched deterministically only, so
  prompts, prompt versions and the stored model inputs don't change. Adding USDA text to the
  model's input would be its own prompt version, later.

**A decision for JT before any build:** when Open Food Facts has **no** data ("Unable to confirm")
and USDA has an ingredient list that matches nothing. Two options:
1. **Strict.** USDA may only add warnings. The verdict stays "Unable to confirm", but any USDA
   warning still shows. Matches "it may only ever add caution" literally, and principle 2.
2. **USDA counts as product data**, like Open Food Facts' text. The card can then read "No listed
   allergens found", from USDA. This is most of the coverage gain for US products, but it moves an
   unknown to a clean verdict, so it is not "only adds caution".

Recommendation: **strict** first, and option 2 only with evidence from the measurement below.
**Open decision.** JT, November 4: no, for now. USDA data alone doesn't give "No listed allergens
found". Revisit after judging, with the measurement.

## Which scan flows

- **Barcode:** yes.
- **Combined (barcode plus label photo):** yes, through the barcode.
- **Label photo alone:** no. There is no barcode to look up, and keyword search by product text
  would guess, so it is left out. A photo already brings its own text.
- **The adaptive flow** (`scanPlan.ts`, whether a photo is required): unchanged under the strict
  option. USDA would never make a photo unnecessary.

## The switch

`USDA_SOURCE`, "on" or "off", off by default; anything else refuses to boot, like the other
switches. Off is exactly today's behaviour, and that is tested in the off state too (BACKLOG's
kill-switch lesson).

## The measurement, before any app change

The same shape as `docs/evidence/2026-11-03-matcher-before-after.md`:
- **Sample:** Open Food Facts' most-scanned US products, a few hundred.
- **Coverage:** how many USDA has, and how many have no Open Food Facts ingredient text but do
  have USDA's.
- **New warnings:** per allergen, Contains vs May contain. USDA has no traces data, so
  "may contain" only where its text says so.
- **False cautions:** each new warning checked by hand against both texts.
- **Disagreements:** where the two sources' ingredient lists differ, and on what.

## Size and risk, honestly

- **API path, built properly:** about 3–4 days. That covers the client, cache, normalization,
  merge, source label, scan-record field, switch, tests in both switch states, and the measurement.
- **Bulk import:** 1–2 days more, with the backup-script change.
- **Risk: high for this week.** It touches every barcode scan's verdict path (the safety core), the
  card's copy and the scan record, between now and a November 13 freeze (now November 16), a week before judging (now four days).
  The freeze's other work (Prof. Yoest's tests and judge card, the logo, the pre-purge backups) is
  already promised.

**Verdict: it doesn't fit before November 13 (now November 16) without risking the verdict path a week
before judging (now four days). It belongs after judging.** What would fit is the measurement alone: an offline script,
no app change, about half a day, using `DEMO_KEY` or a key kept out of the repo. That would show
judges a number ("on US products, a second source would add X warnings"), and it would decide
the strict-or-not question with evidence.
