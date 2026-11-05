import type { AllergenChoice, ProfileHistoryEntry } from "./lib/api";
import { profileChangePhotoUrl } from "./lib/api";
import {
  ACK_FAILED,
  ACKNOWLEDGE,
  collapsedSummary,
  HISTORY_FAILED,
  NO_CHANGES,
  splitHistory,
  UNSEEN_HEADING,
} from "./lib/changeHistory";
import { shortDateTime } from "./lib/dateCopy";
import { describeChange } from "./lib/profileChangeCopy";

type Props = {
  profileId: string;
  profile: { label: string; isSelf: boolean };
  choices: readonly AllergenChoice[];
  history: ProfileHistoryEntry[] | null;
  failed: boolean;
  ackFailed: boolean;
  onAcknowledge: () => void;
};

/**
 * The profile page's change history (Prof. Yoest's Oct 1 conditions), collapsed since 2026-11-05.
 * Condition 2: unseen entries come first and never collapse; only entries already seen go in the
 * closed <details>. A failed load says so outside it, never behind a tap. Props only, so it renders
 * under test without the page's fetches.
 */
export function ChangeHistory({ profileId, profile, choices, history, failed, ackFailed, onAcknowledge }: Props) {
  const { unseen, seen } = splitHistory(history ?? []);
  // With only the collapsed list to show, its summary already says "Change history (N)": the heading
  // stays for screen readers, and isn't printed twice.
  const onlyCollapsed = unseen.length === 0 && seen.length > 0;

  function entry(e: ProfileHistoryEntry) {
    const d = describeChange(e, profile, choices);
    return (
      <li key={e.id} className="change-entry" data-unseen={e.unseen ? "true" : undefined}>
        <p className="change-entry__meta">
          {e.unseen && <strong className="change-entry__new">New · </strong>}
          <time dateTime={e.createdAt}>{shortDateTime(e.createdAt)}</time>
        </p>
        <p className="change-entry__headline">{d.headline}</p>
        {d.details.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {d.check && <p className="change-entry__check">{d.check}</p>}
        {e.downgrade?.scannedAt && <p>Scanned {new Date(e.downgrade.scannedAt).toLocaleDateString()}.</p>}
        {e.downgrade?.hasPhoto && (
          <p>
            <a href={profileChangePhotoUrl(profileId, e.id)} target="_blank" rel="noreferrer">
              Label photo sent with the report
            </a>
          </p>
        )}
        {d.consequences.map((line) => (
          <p key={line} className="change-entry__consequence">
            {line}
          </p>
        ))}
        {d.status && <p className="change-entry__status">{d.status}</p>}
      </li>
    );
  }

  return (
    <section id="changes" className="change-history" aria-labelledby="change-history-heading">
      <h2 id="change-history-heading" className={onlyCollapsed ? "visually-hidden" : undefined}>
        Change history
      </h2>
      {failed && <p role="alert">{HISTORY_FAILED}</p>}
      {history && history.length === 0 && <p>{NO_CHANGES}</p>}
      {unseen.length > 0 && (
        <div className="change-history__unseen">
          <h3>{UNSEEN_HEADING(unseen.length)}</h3>
          <ol className="change-history__list">{unseen.map(entry)}</ol>
          <p>
            <button type="button" onClick={onAcknowledge}>
              {ACKNOWLEDGE}
            </button>
          </p>
          {ackFailed && <p role="alert">{ACK_FAILED}</p>}
        </div>
      )}
      {seen.length > 0 && (
        <details className="change-history__earlier">
          <summary>{collapsedSummary(seen.length, unseen.length > 0)}</summary>
          <ol className="change-history__list">{seen.map(entry)}</ol>
        </details>
      )}
    </section>
  );
}
