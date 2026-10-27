import { Link } from "react-router-dom";

import { needsReviewLine } from "./lib/allergenChoiceCopy";
import type { ProfileSummary, UnseenProfileChanges } from "./lib/api";
import { profilePossessive, unseenBannerLine } from "./lib/profileChangeCopy";

export type NoticeData = {
  unseen: UnseenProfileChanges[];
  unseenFailed: boolean;
  needsReview: ProfileSummary[];
};

/**
 * The two notices that used to live on the dashboard, now at the top of Scan — where a signed-in
 * person lands — and the Profile tab (TabShell.tsx, 2026-10-23).
 *
 * Prof. Yoest's Condition 2: an owner must never learn about a co-manager's change by accident. So
 * it says who changed whose profile, in words, on the first screen; it stays until the entries are
 * acknowledged on the profile page — there's no dismiss button; and a failed check says so, because
 * showing nothing would read as "nothing changed". LandingNotices.test.ts renders it.
 *
 * `slim` is Scan's version (2026-10-26): each notice is one tinted line per profile, the same
 * sentence and the same link, its heading kept for screen readers only. Same data, same rule for
 * going away: no dismiss, gone only when acknowledged or resolved. The Profile tab keeps the full
 * version. The failed-check alert is the same in both.
 */
export function LandingNotices({ unseen, unseenFailed, needsReview, slim = false }: NoticeData & { slim?: boolean }) {
  if (slim) return <SlimNotices unseen={unseen} unseenFailed={unseenFailed} needsReview={needsReview} />;
  return (
    <>
      {unseen.length > 0 && (
        <section className="change-notice" aria-labelledby="change-notice-heading">
          <h2 id="change-notice-heading">Changes to review</h2>
          <ul>
            {unseen.map((u) => (
              <li key={u.profileId}>
                {unseenBannerLine(u)}{" "}
                <Link to={`/profiles/${u.profileId}#changes`}>Review changes to {profilePossessive(u)} profile</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {unseenFailed && (
        <p role="alert">Couldn't check whether anyone changed your profiles. Reload the page to try again.</p>
      )}
      {needsReview.length > 0 && (
        <section className="change-notice" aria-labelledby="allergen-review-heading">
          <h2 id="allergen-review-heading">Allergens to check</h2>
          <ul>
            {needsReview.map((p) => {
              const whose = profilePossessive({ label: p.label, isSelf: p.is_self });
              return (
                <li key={p.id}>
                  {needsReviewLine(whose, p.allergens_needing_review ?? 0)}{" "}
                  <Link to={`/profiles/${p.id}`}>Check {whose} allergens</Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

function SlimNotices({ unseen, unseenFailed, needsReview }: NoticeData) {
  return (
    <>
      {unseen.length > 0 && (
        <section className="change-notice change-notice--slim" aria-labelledby="change-notice-heading">
          <h2 id="change-notice-heading" className="visually-hidden">
            Changes to review
          </h2>
          {unseen.map((u) => (
            <p key={u.profileId}>
              {unseenBannerLine(u)}{" "}
              <Link to={`/profiles/${u.profileId}#changes`}>
                Review changes<span className="visually-hidden"> to {profilePossessive(u)} profile</span>
              </Link>
            </p>
          ))}
        </section>
      )}
      {unseenFailed && (
        <p role="alert">Couldn't check whether anyone changed your profiles. Reload the page to try again.</p>
      )}
      {needsReview.length > 0 && (
        <section className="change-notice change-notice--slim" aria-labelledby="allergen-review-heading">
          <h2 id="allergen-review-heading" className="visually-hidden">
            Allergens to check
          </h2>
          {needsReview.map((p) => {
            const whose = profilePossessive({ label: p.label, isSelf: p.is_self });
            return (
              <p key={p.id}>
                {needsReviewLine(whose, p.allergens_needing_review ?? 0)}{" "}
                <Link to={`/profiles/${p.id}`}>
                  Check<span className="visually-hidden"> {whose} allergens</span>
                </Link>
              </p>
            );
          })}
        </section>
      )}
    </>
  );
}
