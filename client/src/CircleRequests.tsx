import { useState, type FormEvent } from "react";

import { approveCircleRequest, declineCircleRequest, sendCircleRequest, type CircleRequest, type ShareLevel } from "./lib/api";
import {
  APPROVE_NOTE,
  ASK_EMAIL_LABEL,
  ASK_HEADING,
  ASK_NOTE,
  ASK_SENT,
  CHOOSE_BOTH,
  NOTHING_LEFT_TO_SHARE,
  REQUESTS_HEADING,
  requestLine,
  SHARE_CHOICES,
} from "./lib/circleRequestCopy";

/**
 * Follow requests on the Circle tab (2026-10-27, behind CIRCLE_REQUESTS; server
 * routes/circleRequests.ts). The owner's waiting requests, each decided here: which of their own
 * profiles, and what the requester sees — neither chosen until the owner chooses, like severity.
 * Only an owner is ever sent any, so nobody else sees this section.
 */
export function FollowRequests({ requests, onChanged }: { requests: CircleRequest[]; onChanged: () => void }) {
  if (requests.length === 0) return null;
  return (
    <section id="follow-requests" aria-labelledby="follow-requests-heading">
      <h2 id="follow-requests-heading">{REQUESTS_HEADING}</h2>
      <p>{APPROVE_NOTE}</p>
      <ul className="card-list">
        {requests.map((r) => (
          <FollowRequestCard key={r.id} request={r} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  );
}

function FollowRequestCard({ request, onChanged }: { request: CircleRequest; onChanged: () => void }) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [shareLevel, setShareLevel] = useState<ShareLevel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await run();
      onChanged();
    } catch {
      setError("That didn't go through. Reload the page and try again.");
      setBusy(false);
    }
  }

  function onApprove() {
    if (!profileId || !shareLevel) {
      setError(CHOOSE_BOTH);
      return;
    }
    void act(() => approveCircleRequest(request.id, profileId, shareLevel));
  }

  return (
    <li className="card">
      {/* Not card__title: that's styled as a link, and this card isn't one. */}
      <p>
        <strong>{requestLine(request)}</strong>
      </p>
      {request.profiles.length === 0 ? (
        <p>{NOTHING_LEFT_TO_SHARE}</p>
      ) : (
        <>
          <fieldset>
            <legend>Which profile?</legend>
            {request.profiles.map((p) => (
              <label key={p.id}>
                <input
                  type="radio"
                  name={`request-${request.id}-profile`}
                  value={p.id}
                  checked={profileId === p.id}
                  onChange={() => setProfileId(p.id)}
                />
                {p.label}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>What they'll see</legend>
            {SHARE_CHOICES.map((c) => (
              <label key={c.value}>
                <input
                  type="radio"
                  name={`request-${request.id}-share`}
                  value={c.value}
                  checked={shareLevel === c.value}
                  onChange={() => setShareLevel(c.value)}
                />
                {c.label}
              </label>
            ))}
          </fieldset>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <p className="card__actions">
        {request.profiles.length > 0 && (
          <button type="button" disabled={busy} onClick={onApprove}>
            Approve
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => void act(() => declineCircleRequest(request.id))}>
          Decline
        </button>
      </p>
    </li>
  );
}

/** Asking to follow: the parent's address, and the same answer whatever it was. */
export function AskToFollow() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSent(false);
    try {
      await sendCircleRequest(email);
      setSent(true);
      setEmail("");
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(
        status === 429
          ? "You've sent a lot of requests today. Try again tomorrow."
          : status === 400
            ? "Enter an email address."
            : "That didn't go through. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="request-to-follow-heading">
      <h2 id="request-to-follow-heading">{ASK_HEADING}</h2>
      <form onSubmit={onSubmit}>
        <label>
          {ASK_EMAIL_LABEL}
          <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <p className="card__meta">{ASK_NOTE}</p>
        <button type="submit" className="button-secondary" disabled={submitting}>
          Send request
        </button>
      </form>
      {sent && <p role="status">{ASK_SENT}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
