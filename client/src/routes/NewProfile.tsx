import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAllergenChoices } from "../AllergenPicker";
import { listedAllergenMessage, OTHER_WARNING } from "../lib/allergenChoiceCopy";
import { ApiRequestError, createProfile, type AllergenChoice, type Severity } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { signupSetupProgress } from "../lib/guidedRegister";
import { markGuidedSetupSkipped, setupArrival, SKIP_FOR_NOW } from "../lib/guidedSetupEntry";
import {
  addOther,
  allergenName,
  back,
  canContinue,
  checkOtherName,
  firstUnanswered,
  initialAnswers,
  isOther,
  mayContainUnsafe,
  next,
  progress,
  toCreateInput,
  togglePick,
  type AllergenId,
  type GuidedAnswers,
  type Position,
} from "../lib/guidedSetup";
import {
  ADD_OTHER,
  ALLERGENS_SUB,
  allergensQuestion,
  ASKED_LABEL,
  BACK,
  BACK_TO_REVIEW,
  CHANGE,
  chipReply,
  CLASSIC_LINK,
  CONTINUE,
  finishQuestion,
  GO_TO_SCAN,
  MAY_CONTAIN_LABEL,
  MAY_CONTAIN_SUB,
  mayContainQuestion,
  mayContainSummary,
  NAME_LABEL,
  NAME_SUB,
  nameQuestion,
  OTHER_LABEL,
  REVIEW_SUB,
  reviewQuestion,
  SAMPLE_BUTTON,
  SAMPLE_LINE,
  SAVE,
  savedLine,
  severityQuestion,
  SHOW_MORE,
  SOMETHING_ELSE,
  WHO_CHOICES,
  WHO_QUESTION,
  WHO_SUB,
} from "../lib/guidedSetupCopy";
import { ADD_PROFILE_PATH } from "../lib/profileSections";
import { LANDING_PATH } from "../lib/tabs";
import { SEVERITY_CHOICES } from "../lib/severityCopy";

const CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l5 5 9-10" />
  </svg>
);

/**
 * The guided profile setup (2026-10-27, behind GUIDED_SETUP; BACKLOG "Plan to judging" item 7): one
 * question at a time, answered by tapping — who it's for, a first name, the allergens, each one's
 * severity (no default), "may contain", then a review. No AI and no third-party call. Nothing is saved
 * before the review's Save, which sends the classic form's own body to POST /profiles
 * (lib/guidedSetup.ts toCreateInput). Back never clears an answer. Each new question takes focus.
 */
export function NewProfile() {
  const { guidedSetupEnabled, user } = useAuth();
  const navigate = useNavigate();
  // Reached from sign-up or a first visit (lib/guidedSetupEntry.ts): "Skip for now" on every step,
  // and from sign-up the progress bar carries on from register's.
  const arrival = setupArrival(useLocation().search);
  const choices = useAllergenChoices();
  const [answers, setAnswers] = useState<GuidedAnswers>(initialAnswers);
  const [pos, setPos] = useState<Position>({ step: "who" });
  const [returnToReview, setReturnToReview] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [otherRefusal, setOtherRefusal] = useState<AllergenChoice | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus moves to each new question, so a screen reader reads it and the keyboard starts there.
  useEffect(() => {
    headingRef.current?.focus();
  }, [pos, savedId]);

  if (!guidedSetupEnabled) return <Navigate to={ADD_PROFILE_PATH} replace />;
  if (!choices) return <p>Loading…</p>;

  function goTo(p: Position) {
    setReply(null);
    setPos(p);
  }

  function onContinue() {
    // From a change made on the review: back to it once everything is answered again.
    goTo(returnToReview ? firstUnanswered(answers) : next(pos, answers));
  }

  function edit(p: Position) {
    setReturnToReview(true);
    goTo(p);
  }

  async function onSave() {
    const input = toCreateInput(answers);
    if (!input) return;
    setSaving(true);
    setSaveError(null);
    try {
      const profile = await createProfile(input);
      setSavedId(profile.id);
    } catch (err) {
      setSaveError(
        err instanceof ApiRequestError && err.message === "listed_allergen"
          ? listedAllergenMessage(null, String(err.detail.displayName))
          : "Couldn't save the profile. Check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const name = (id: AllergenId) => allergenName(id, answers, choices);
  const bar = (percent: number) => (arrival === "signup" ? signupSetupProgress(percent) : percent);
  const skip = arrival && (
    <p className="guided__classic">
      <button
        type="button"
        className="guided__more"
        onClick={() => {
          if (user) markGuidedSetupSkipped(user.id);
          navigate(LANDING_PATH);
        }}
      >
        {SKIP_FOR_NOW}
      </button>
    </p>
  );
  const severityLabel = (s: Severity) => SEVERITY_CHOICES.find((c) => c.value === s)!.label;

  if (savedId) {
    return (
      <main className="guided">
        <section className="guided__step" key="finish">
          <Progress value={100} />
          <p className="guided__done">{savedLine(answers)}</p>
          <h1 className="guided__question" tabIndex={-1} ref={headingRef}>
            {finishQuestion(answers)}
          </h1>
          <ul className="card-list">
            {answers.picked.map((id) => (
              <li key={id} className="card">
                <strong>{name(id)}</strong>
                <span className="card__meta card__line">
                  {severityLabel(answers.severity[id]!)} · {mayContainSummary(mayContainUnsafe(answers, id))}
                </span>
              </li>
            ))}
          </ul>
          <div className="guided__actions">
            <button type="button" className="button-primary" onClick={() => navigate(`/scan?profile=${savedId}&sample=1`)}>
              {SAMPLE_BUTTON}
            </button>
            <p className="guided__sub">{SAMPLE_LINE}</p>
            <Link to={`/scan?profile=${savedId}`}>{GO_TO_SCAN}</Link>
          </div>
        </section>
      </main>
    );
  }

  const previous = pos.step === "who" ? null : back(pos, answers);
  const ready = canContinue(pos, answers);
  const continueLabel = returnToReview && firstUnanswered(answers).step === "review" ? BACK_TO_REVIEW : CONTINUE;
  const primary = (
    <p>
      <button type="button" className="button-primary guided__continue" disabled={!ready} onClick={onContinue}>
        {continueLabel}
      </button>
    </p>
  );

  function answerOf(p: Position): string {
    switch (p.step) {
      case "who":
        return WHO_CHOICES.find((c) => c.value === answers.who)?.label ?? "";
      case "name":
        return answers.name.trim();
      case "allergens":
        return answers.picked.map(name).join(", ");
      case "severity":
        return answers.severity[p.id] ? severityLabel(answers.severity[p.id]!) : "";
      case "mayContain":
        return answers.picked.every((id) => mayContainUnsafe(answers, id)) ? "Counts as unsafe for all" : "Changed for some";
      default:
        return "";
    }
  }

  const visible = choices.filter((c) => c.group === "common" || showMore || answers.picked.includes(c.key));

  return (
    <main className="guided">
      <section className="guided__step" key={pos.step === "severity" ? `severity-${pos.id}` : pos.step}>
        <Progress value={bar(progress(pos, answers))} />
        <div className="guided__top">
          {previous && (
            <button type="button" className="guided__back" onClick={() => goTo(previous)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
              {BACK}
            </button>
          )}
        </div>

        {/* Only the most recent answer: the question stays near the top on a phone. Back and the
            review hold the rest. */}
        {previous && previous.step !== "review" && answerOf(previous) && (
          <div className="guided__transcript">
            <p className="guided__asked">{previous.step === "severity" ? `${name(previous.id)} — severity` : ASKED_LABEL[previous.step]}</p>
            <p className="guided__answer">{answerOf(previous)}</p>
          </div>
        )}

        {pos.step === "who" && (
          <>
            <h1 className="guided__question" tabIndex={-1} ref={headingRef}>
              {WHO_QUESTION}
            </h1>
            <p className="guided__sub">{WHO_SUB}</p>
            <div className="guided__cards" role="radiogroup" aria-label={WHO_QUESTION}>
              {WHO_CHOICES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={answers.who === c.value}
                  className="guided__card"
                  onClick={() => {
                    const updated = { ...answers, who: c.value };
                    setAnswers(updated);
                    goTo(returnToReview ? firstUnanswered(updated) : { step: "name" });
                  }}
                >
                  {answers.who === c.value && CHECK}
                  <strong>{c.label}</strong>
                  <span>{c.line}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {pos.step === "name" && (
          <>
            <h1 className="guided__question" tabIndex={-1} ref={headingRef}>
              {nameQuestion(answers.who)}
            </h1>
            <p className="guided__sub">{NAME_SUB}</p>
            <label>
              {NAME_LABEL}
              <input
                value={answers.name}
                autoComplete="off"
                onChange={(e) => setAnswers({ ...answers, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && ready) onContinue();
                }}
              />
            </label>
            {primary}
          </>
        )}

        {pos.step === "allergens" && (
          <>
            <h1 className="guided__question" tabIndex={-1} ref={headingRef}>
              {allergensQuestion(answers)}
            </h1>
            <p className="guided__sub">{ALLERGENS_SUB}</p>
            <div className="guided__chips" role="group" aria-label={allergensQuestion(answers)}>
              {visible.map((c) => {
                const on = answers.picked.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    className="guided__chip"
                    aria-pressed={on}
                    onClick={() => {
                      setAnswers(togglePick(answers, c.key));
                      setReply(on ? null : chipReply(c));
                    }}
                  >
                    {on && CHECK}
                    {c.displayName}
                  </button>
                );
              })}
              {answers.picked.filter(isOther).map((id) => (
                <button key={id} type="button" className="guided__chip" aria-pressed={true} onClick={() => setAnswers(togglePick(answers, id))}>
                  {CHECK}
                  {name(id)}
                </button>
              ))}
              <button type="button" className="guided__chip" aria-pressed={otherOpen} onClick={() => setOtherOpen(!otherOpen)}>
                {otherOpen && CHECK}
                {SOMETHING_ELSE}
              </button>
            </div>
            {!showMore && (
              <p>
                <button type="button" className="guided__more" onClick={() => setShowMore(true)}>
                  {SHOW_MORE}
                </button>
              </p>
            )}
            {otherOpen && (
              <div className="guided__other">
                <label>
                  {OTHER_LABEL}
                  <input
                    value={otherText}
                    autoComplete="off"
                    onChange={(e) => {
                      setOtherText(e.target.value);
                      setOtherRefusal(null);
                    }}
                  />
                </label>
                <p className="allergen-picker__hint">{OTHER_WARNING}</p>
                {otherRefusal ? (
                  <>
                    <p className="guided__reply" role="status">
                      {listedAllergenMessage(otherText.trim(), otherRefusal.displayName)}
                    </p>
                    <p>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => {
                          if (!answers.picked.includes(otherRefusal.key)) setAnswers(togglePick(answers, otherRefusal.key));
                          setReply(chipReply(otherRefusal));
                          setOtherText("");
                          setOtherRefusal(null);
                          setOtherOpen(false);
                        }}
                      >
                        Choose {otherRefusal.displayName}
                      </button>
                    </p>
                  </>
                ) : (
                  <p>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={otherText.trim() === ""}
                      onClick={() => {
                        const check = checkOtherName(otherText, choices);
                        if (!check.ok) {
                          if (check.reason === "listed") setOtherRefusal(check.choice);
                          return;
                        }
                        setAnswers(addOther(answers, check));
                        setReply(check.name);
                        setOtherText("");
                        setOtherOpen(false);
                      }}
                    >
                      {ADD_OTHER}
                    </button>
                  </p>
                )}
              </div>
            )}
            {reply && (
              <p className="guided__reply" role="status">
                {reply}
              </p>
            )}
            {primary}
          </>
        )}

        {pos.step === "severity" && (
          <>
            <h1 className="guided__question" tabIndex={-1} ref={headingRef}>
              {severityQuestion(answers, name(pos.id))}
            </h1>
            <div className="guided__cards" role="radiogroup" aria-label={severityQuestion(answers, name(pos.id))}>
              {SEVERITY_CHOICES.map((c) => {
                const on = answers.severity[pos.id] === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className="guided__card"
                    onClick={() => setAnswers({ ...answers, severity: { ...answers.severity, [pos.id]: c.value } })}
                  >
                    {on && CHECK}
                    <strong>{c.label}</strong>
                    <span>{c.line}</span>
                  </button>
                );
              })}
            </div>
            {primary}
          </>
        )}

        {pos.step === "mayContain" && (
          <>
            <h1 className="guided__question" tabIndex={-1} ref={headingRef}>
              {mayContainQuestion(answers)}
            </h1>
            <p className="guided__sub">{MAY_CONTAIN_SUB}</p>
            <div className="guided__checks">
              {answers.picked.map((id) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={mayContainUnsafe(answers, id)}
                    onChange={(e) => setAnswers({ ...answers, mayContainUnsafe: { ...answers.mayContainUnsafe, [id]: e.target.checked } })}
                  />
                  <span>
                    <strong>{name(id)}</strong>
                    <span>{MAY_CONTAIN_LABEL}</span>
                  </span>
                </label>
              ))}
            </div>
            {primary}
          </>
        )}

        {pos.step === "review" && (
          <>
            <h1 className="guided__question" tabIndex={-1} ref={headingRef}>
              {reviewQuestion(answers)}
            </h1>
            <p className="guided__sub">{REVIEW_SUB}</p>
            <ul className="guided__rows">
              <ReviewRow label="For" value={answerOf({ step: "who" })} onChange={() => edit({ step: "who" })} />
              <ReviewRow label="First name" value={answers.name.trim()} onChange={() => edit({ step: "name" })} />
              <ReviewRow label="Allergens" value={answerOf({ step: "allergens" })} onChange={() => edit({ step: "allergens" })} />
              {answers.picked.map((id) => (
                <ReviewRow
                  key={id}
                  label={name(id)}
                  value={severityLabel(answers.severity[id]!)}
                  onChange={() => edit({ step: "severity", id })}
                />
              ))}
              <ReviewRow
                label="“May contain”"
                value={answers.picked.map((id) => `${name(id)}: ${mayContainSummary(mayContainUnsafe(answers, id))}`).join("; ")}
                onChange={() => edit({ step: "mayContain" })}
              />
            </ul>
            {saveError && <p role="alert">{saveError}</p>}
            <p>
              <button type="button" className="button-primary guided__continue" disabled={saving} onClick={() => void onSave()}>
                {saving ? "Saving…" : SAVE}
              </button>
            </p>
          </>
        )}

        <Link className="guided__classic" to={ADD_PROFILE_PATH}>
          {CLASSIC_LINK}
        </Link>
        {skip}
      </section>
    </main>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="guided__progress" role="progressbar" aria-label="Progress" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

function ReviewRow({ label, value, onChange }: { label: string; value: string; onChange: () => void }) {
  return (
    <li>
      <button type="button" className="guided__row" onClick={onChange}>
        <span>
          <small>{label}</small>
          {value}
        </span>
        <em>
          {CHANGE}
          <span className="visually-hidden"> {label}</span>
        </em>
      </button>
    </li>
  );
}
