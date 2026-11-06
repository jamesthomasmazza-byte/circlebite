import { useState } from "react";

import { BottomSheet } from "./BottomSheet";
import { createFollowInvite, createManagerInvite, type ProfileSummary } from "./lib/api";
import {
  ADD_CHOICES,
  ADD_SUBTITLE,
  addTitle,
  inviteUrl,
  LINK_FOOTNOTE,
  SHARE_INVITE,
  shareMessage,
  type AddChoice,
} from "./lib/circleRedesign";
import { COPIED, COPY_FAILED, COPY_LINK, CREATE_INVITE_LINK, INVITE_FAILED } from "./lib/inviteCopy";

/**
 * "Add to <name>'s circle" (JT's mockup, 2026-11-06, behind CIRCLE_REDESIGN). Three choices and none
 * picked, as with severity (Oct 25). The link is made only on "Create invite link", through the
 * same endpoints as today's tab — a co-manager still comes by invite link only (CONTEST_RULES §3a) —
 * and the choice then locks, so changing your mind never leaves a stray live link behind. The
 * message is shared by the parent, from their own phone: the app sends nothing itself.
 */
export function AddToCircleSheet({
  profile,
  open,
  onClose,
  onMade,
}: {
  profile: Pick<ProfileSummary, "id" | "label" | "is_self">;
  open: boolean;
  onClose: () => void;
  onMade: () => void;
}) {
  const [choice, setChoice] = useState<AddChoice | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  function close() {
    setChoice(null);
    setUrl(null);
    setError(null);
    setStatus("");
    onClose();
  }

  async function make() {
    if (!choice) return;
    setMaking(true);
    setError(null);
    try {
      const { token } =
        choice === "co_manager" ? await createManagerInvite(profile.id) : await createFollowInvite(profile.id, { shareLevel: choice });
      setUrl(inviteUrl(window.location.origin, choice, token));
      onMade();
    } catch {
      setError(INVITE_FAILED);
    } finally {
      setMaking(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(COPIED);
    } catch {
      setStatus(COPY_FAILED);
    }
  }

  // The phone's own share sheet where there is one; else the message is copied.
  async function share(text: string) {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
      } catch (err) {
        if ((err as Error).name !== "AbortError") await copy(text);
      }
      return;
    }
    await copy(text);
  }

  const message = url ? shareMessage(profile, url) : null;

  return (
    <BottomSheet open={open} onClose={close} labelledBy="add-sheet-title">
      <h2 id="add-sheet-title">{addTitle(profile)}</h2>
      <fieldset className="choice-cards" disabled={url !== null}>
        <legend>{ADD_SUBTITLE}</legend>
        {ADD_CHOICES.map((c) => (
          <label key={c.value} className="choice-card">
            <input type="radio" name="add-choice" value={c.value} checked={choice === c.value} onChange={() => setChoice(c.value)} />
            <span>
              <span className="choice-card__title">{c.title}</span>
              <span className="choice-card__hint">{c.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {error && <p role="alert">{error}</p>}

      {!message ? (
        <p>
          <button type="button" className="button-primary" disabled={!choice || making} onClick={() => void make()}>
            {CREATE_INVITE_LINK}
          </button>
        </p>
      ) : (
        <>
          <p className="share-preview__label">Message preview</p>
          <p className="share-preview">{message}</p>
          <p className="share-actions">
            <button type="button" className="button-primary" onClick={() => void share(message)}>
              {SHARE_INVITE}
            </button>
            <button type="button" onClick={() => void copy(url!)}>
              {COPY_LINK}
            </button>
          </p>
          <p role="status">{status}</p>
          <p className="member-row__note">{LINK_FOOTNOTE}</p>
        </>
      )}
    </BottomSheet>
  );
}
