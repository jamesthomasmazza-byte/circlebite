import { Link } from "react-router-dom";

import type { MatchedAllergen, ScanResult } from "../lib/api";
import { classificationLabel, sourceLabel } from "../lib/allergenRowCopy";
import { circleReportLine } from "../lib/correctionCopy";
import { DISCLAIMER, EMERGENCY, VERDICT_LABEL } from "../lib/verdictCopy";

/**
 * The signed-out landing page (2026-10-30), from docs/design/landing-mockup.html: its copy word for
 * word, its layout and pictures rebuilt here. Shown at "/" only to someone signed out (Home.tsx).
 *
 * The pictured result cards are the real card's markup and classes, and every word on them comes
 * from the code that writes a real card — the verdict, the row's claim and source, the circle
 * report's sentence, the disclaimer — so the page can't promise wording the app doesn't use.
 * Each picture is one role="img" with the mockup's description. Synthetic names only (R9).
 */

export const SAMPLE_PRODUCT = { name: "Oat Biscuits", brand: "Fernhallow" };

// A barcode scan's rows, as the server would send them for the pictures below.
const BARCODE_SCAN: Pick<ScanResult, "source"> = { source: "barcode" };

const SESAME: MatchedAllergen & { matchedText: string } = {
  allergenName: "Sesame",
  matched: true,
  source: "ingredients",
  matchedText: "sesame",
  severity: "severe",
  classification: "contains",
};

const MILK: MatchedAllergen = {
  allergenName: "Milk",
  matched: true,
  source: "trace",
  severity: "moderate",
  classification: "caution",
};

const WHEAT: MatchedAllergen = {
  allergenName: "Wheat",
  matched: true,
  source: null,
  severity: "moderate",
  classification: "contains",
  circleReported: true,
};

// A follower's view: the reporter by role only (correctionCopy.ts).
const WHEAT_REPORT_LINE = circleReportLine(
  { allergenName: "Wheat", reporters: [{ name: null, role: "co_manager", isViewer: false, withheld: true }] },
  "Noor",
);

export function Landing() {
  return (
    <div className="landing">
      <header className="landing__bar">
        <div className="landing__wrap">
          <a href="#top" className="landing__name">
            CircleBite
          </a>
          <nav aria-label="Account" className="landing__account">
            <Link to="/login" className="landing__text-link">
              Log in
            </Link>
            <Link to="/register" className="landing__button landing__button--small">
              Create an account
            </Link>
          </nav>
        </div>
      </header>

      <main id="top">
        <section>
          <div className="landing__wrap landing__hero">
            <div className="landing__stack">
              <h1>Check every label against your child's allergies.</h1>
              <p className="landing__lead">
                Scan a barcode or photograph the ingredients. CircleBite shows what it found, where it found it, and
                what your circle has reported, so the grandparents and the babysitter check the same way you do.
              </p>
              <div className="landing__actions">
                <Link to="/register" className="landing__button">
                  Create an account
                </Link>
                <a href="#how" className="landing__button landing__button--secondary">
                  See how it works
                </a>
              </div>
              <p className="landing__fine">A screening aid, not a guarantee. Always check the physical label.</p>
            </div>

            <div>
              <figure className="landing__label">
                <figcaption>
                  {SAMPLE_PRODUCT.name}, {SAMPLE_PRODUCT.brand} (sample label)
                </figcaption>
                <p>
                  <strong>Ingredients:</strong> whole grain oats, <strong>wheat</strong> flour, sugar, sunflower oil,
                  golden syrup, <span className="landing__mark landing__mark--contains">sesame</span> seeds, raising
                  agent (sodium bicarbonate), salt.
                </p>
                <p>
                  <strong>May contain:</strong> <span className="landing__mark landing__mark--caution">milk</span>, tree
                  nuts.
                </p>
              </figure>

              <div
                role="img"
                aria-label="CircleBite result: Contains an allergen. Sesame, severe, contains."
                className="landing__card landing__hero-card verdict-card"
                data-verdict="contains_allergen"
              >
                <div className="verdict-card__header">
                  <p className="verdict-card__headline">{VERDICT_LABEL.contains_allergen}</p>
                  <p className="verdict-card__product">
                    {SAMPLE_PRODUCT.name} — {SAMPLE_PRODUCT.brand}
                  </p>
                </div>
                <div className="verdict-card__body">
                  <ul className="allergen-rows">
                    <PicturedRow row={SESAME} showSeverity />
                  </ul>
                  <p className="verdict-card__disclaimer">{DISCLAIMER}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing__tinted">
          <div className="landing__wrap landing__split">
            <h2>Reading labels is a second job.</h2>
            <div className="landing__body">
              <p>
                Recipes change without notice. Allergens hide under other names: whey and casein are milk, semolina is
                wheat, tahini is sesame. The "may contain" line is easy to miss in a busy aisle.
              </p>
              <p>
                And you are not the only one buying food. Every grandparent, babysitter and coach has to know the same
                list and read the same small print.
              </p>
              <div
                role="img"
                aria-label="Examples of hidden names: whey and casein mean milk, semolina means wheat, tahini means sesame, albumin means egg"
                className="landing__names"
              >
                {[
                  ["whey, casein", "milk"],
                  ["semolina", "wheat"],
                  ["tahini", "sesame"],
                  ["albumin", "egg"],
                ].map(([hidden, allergen]) => (
                  <div key={hidden} className="landing__name-pair">
                    <span>{hidden}</span>
                    <span>{allergen}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="how">
          <div className="landing__wrap landing__stack">
            <h2>How it works</h2>
            <ol className="landing__steps">
              <li>
                <div
                  role="img"
                  aria-label="Phone camera view with a barcode lined up inside the scanning box"
                  className="landing__tile landing__tile--camera"
                >
                  <ViewfinderPicture />
                  <span>Line up the barcode inside the box</span>
                </div>
                <span aria-hidden="true" className="landing__step-number">
                  1
                </span>
                <h3>Scan the barcode</h3>
                <p>
                  Point your phone at the package. No barcode, or the product isn't on file? Photograph the ingredients
                  panel instead.
                </p>
              </li>
              <li>
                <div
                  role="img"
                  aria-label="Result card: May contain, caution. Milk, may contain traces, from the product's allergen warning"
                  className="landing__tile landing__tile--card"
                >
                  <div className="landing__card verdict-card" data-verdict="may_contain_caution">
                    <div className="verdict-card__header">
                      <p className="verdict-card__headline">{VERDICT_LABEL.may_contain_caution}</p>
                    </div>
                    <div className="verdict-card__body">
                      <ul className="allergen-rows">
                        <PicturedRow row={MILK} />
                      </ul>
                      <p className="verdict-card__disclaimer">{DISCLAIMER}</p>
                    </div>
                  </div>
                </div>
                <span aria-hidden="true" className="landing__step-number">
                  2
                </span>
                <h3>Read the result and the reason</h3>
                <p>
                  Each allergen on your child's profile is checked. The result says what was found and where: the
                  ingredients, a "may contain" warning, or a report from a parent who photographed the label.
                </p>
              </li>
              <li>
                <div
                  role="img"
                  aria-label="Four people sharing one child's profile: you, a co-parent, a grandparent and a sitter"
                  className="landing__tile landing__tile--circle"
                >
                  <div className="landing__avatars">
                    <span className="landing__avatar landing__avatar--you">You</span>
                    <span className="landing__avatar landing__avatar--co">CP</span>
                    <span className="landing__avatar landing__avatar--grand">G</span>
                    <span className="landing__avatar landing__avatar--sitter">S</span>
                  </div>
                  <svg aria-hidden="true" width="200" height="24" viewBox="0 0 200 24" fill="none">
                    <path
                      d="M26 0 C26 14 100 10 100 24 M74 0 C74 10 100 12 100 24 M126 0 C126 10 100 12 100 24 M174 0 C174 14 100 10 100 24"
                      stroke="currentColor"
                      strokeOpacity="0.6"
                      strokeWidth="2"
                    />
                  </svg>
                  <span className="landing__pill">Maya's profile: peanut, sesame</span>
                </div>
                <span aria-hidden="true" className="landing__step-number">
                  3
                </span>
                <h3>Share it with your circle</h3>
                <p>
                  Invite the people who feed your child. They scan against the same profile, so everyone checks for the
                  same allergens.
                </p>
              </li>
            </ol>
          </div>
        </section>

        <section className="landing__band">
          <div className="landing__wrap landing__split">
            <div className="landing__body">
              <h2>One profile, everyone who feeds your child.</h2>
              <p>
                You own your child's profile and decide who joins. A co-parent can help manage it. Grandparents and
                sitters can follow it and scan with it. When someone in the circle reports an allergen on a label, the
                circle sees the warning, and a follower sees their role, never their name.
              </p>
            </div>
            <div role="img" aria-label="Example circle report as a follower sees it" className="landing__report">
              <ul className="allergen-rows">
                <PicturedRow row={WHEAT} />
              </ul>
              <p className="landing__report-line">{WHEAT_REPORT_LINE}</p>
              <p className="landing__fine">Sample data. Names are illustrative.</p>
            </div>
          </div>
        </section>

        <section>
          <div className="landing__wrap landing__stack">
            <h2>It shows its work, so you can judge it.</h2>
            <div className="landing__trust">
              <div>
                <h3>Every result gives its reason</h3>
                <p>
                  You see whether a warning came from the ingredients, the product's allergen statement, or another
                  parent's report. When the data can't answer, it says "{VERDICT_LABEL.unable_to_confirm}" instead of
                  guessing.
                </p>
              </div>
              <div>
                <h3>Reports need a photo of the label</h3>
                <p>
                  A parent who spots an allergen the product data missed reports it with a photo of the package, so the
                  evidence comes with the warning.
                </p>
              </div>
              <div>
                <h3>Warnings are easy to raise, hard to remove</h3>
                <p>
                  It takes two separate families to confirm a warning for everyone. Taking a warning away is never
                  automatic: a report that an allergen isn't there waits for review, so one mistaken report can't remove
                  it.
                </p>
              </div>
              <div>
                <h3>A second look, not a replacement</h3>
                <p>
                  CircleBite is a screening aid. Product data can be wrong or out of date, so always check the physical
                  label, especially for "may contain" warnings.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="landing__tinted landing__data">
          <div className="landing__wrap landing__split">
            <h2>Your family's data</h2>
            <ul>
              <li>Accounts are for adults. A child's profile holds their name and allergy details.</li>
              <li>The camera runs only while you scan.</li>
              <li>Followers never see who else is in the circle.</li>
              <li>No ads, and your data is never sold.</li>
            </ul>
          </div>
        </section>

        <section className="landing__closing">
          <div className="landing__wrap landing__stack">
            <h2>Set up your child's profile before your next grocery run.</h2>
            <p className="landing__lead">
              Create your account, add your child's allergens one question at a time, then invite the people who feed
              them.
            </p>
            <div className="landing__actions">
              <Link to="/register" className="landing__button">
                Create an account
              </Link>
              <Link to="/login" className="landing__text-link">
                Already have an account? Log in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing__footer">
        <div className="landing__wrap">
          <p>CircleBite is a screening aid, not a guarantee. Always check the physical label.</p>
          <p>
            <strong>{EMERGENCY}</strong>
          </p>
        </div>
      </footer>
    </div>
  );
}

/** One allergen row as the live card draws it (Scan.tsx), from the same copy functions. */
function PicturedRow({ row, showSeverity = false }: { row: MatchedAllergen; showSeverity?: boolean }) {
  return (
    <li className="allergen-row" data-claim={row.classification}>
      <span className="allergen-row__head">
        <strong className="allergen-row__name">{row.allergenName}</strong>
        {showSeverity && (
          <span className="allergen-row__severity" data-severity={row.severity}>
            {row.severity}
          </span>
        )}
      </span>
      <span className="allergen-row__claim">{classificationLabel(row)}</span>
      <span className="allergen-row__source" data-source={row.circleReported ? "circle" : "label"}>
        {sourceLabel(row, BARCODE_SCAN)}
      </span>
    </li>
  );
}

function ViewfinderPicture() {
  const bars = [
    [38, 4], [45, 2], [50, 6], [59, 2], [64, 4], [72, 2], [77, 6], [86, 2], [91, 4], [98, 2],
    [103, 6], [112, 2], [117, 4], [125, 2], [130, 6], [139, 2], [144, 4], [151, 2], [156, 6],
  ];
  return (
    <svg aria-hidden="true" width="200" height="120" viewBox="0 0 200 120" fill="none">
      <path
        d="M10 30 V10 H30 M170 10 H190 V30 M190 90 V110 H170 M30 110 H10 V90"
        stroke="var(--color-viewfinder-mark)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g fill="currentColor">
        {bars.map(([x, w]) => (
          <rect key={x} x={x} y="28" width={w} height="56" />
        ))}
      </g>
      <rect x="30" y="56" width="140" height="2" fill="var(--color-viewfinder-mark)" />
    </svg>
  );
}
