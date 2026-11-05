import { useState, type ReactNode } from "react";

import type { Allergen, AllergenInput, Severity } from "./lib/api";
import {
  NOTES_LABEL,
  REMOVE,
  ROW_SAVE_FAILED,
  SAVE_NOTES,
  TRACES_SETTING,
  TRACES_SETTING_HINT,
  tracesNote,
} from "./lib/profileAllergenCopy";

/**
 * One allergen on the profile page, as a compact row (2026-11-05, BACKLOG item 9a): the name, the
 * verdict card's severity pill and the traces setting, always visible. For a manager the row is a
 * <details>, keyboard- and screen-reader-operable as it is: opening it shows the severity, traces
 * and notes controls and Remove. A "needs a look" notice (`review`) renders after the <details>,
 * never inside it, so it shows without a tap. A follower's row has nothing to open, and the page
 * shows them no notes, as before.
 */
export function AllergenItem({
  allergen: a,
  canManage,
  review,
  onUpdate,
  onRemove,
}: {
  allergen: Allergen;
  canManage: boolean;
  review?: ReactNode;
  onUpdate: (input: Partial<AllergenInput>) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [notes, setNotes] = useState(a.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save(input: Partial<AllergenInput>) {
    setError(null);
    try {
      await onUpdate(input);
    } catch {
      setError(ROW_SAVE_FAILED);
    }
  }

  async function remove() {
    setError(null);
    try {
      await onRemove();
    } catch {
      setError(ROW_SAVE_FAILED);
    }
  }

  // The "(" ")" and ", " stay in the DOM, visually hidden, so a screen reader hears one sentence:
  // "Peanut (severe), traces: unsafe" — the verdict card's pill does the same.
  const line = (
    <span className="allergen-item__line">
      <strong className="allergen-item__name">{a.name}</strong>{" "}
      <span className="severity-pill" data-severity={a.severity}>
        <span className="visually-hidden">(</span>
        {a.severity}
        <span className="visually-hidden">)</span>
      </span>
      <span className="visually-hidden">,</span>{" "}
      <span className="allergen-item__traces">{tracesNote(a.treat_traces_as_unsafe)}</span>
    </span>
  );

  if (!canManage) {
    return (
      <li className="card allergen-item">
        {line}
        {review}
      </li>
    );
  }

  return (
    <li className="card allergen-item">
      <details className="allergen-item__details">
        <summary className="allergen-item__summary">{line}</summary>
        <div className="allergen-item__body">
          <label>
            Severity
            <select
              aria-label={`Severity of ${a.name}`}
              value={a.severity}
              onChange={(e) => void save({ severity: e.target.value as Severity })}
            >
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </select>
          </label>
          <label className="allergen-item__check">
            <input
              type="checkbox"
              checked={a.treat_traces_as_unsafe}
              onChange={(e) => void save({ treatTracesAsUnsafe: e.target.checked })}
            />
            {TRACES_SETTING}
          </label>
          <p className="allergen-picker__hint">{TRACES_SETTING_HINT}</p>
          <label>
            {NOTES_LABEL}
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <p className="card__actions">
            <button type="button" onClick={() => void save({ notes: notes.trim() || null })}>
              {SAVE_NOTES}
            </button>{" "}
            <button type="button" onClick={() => void remove()}>
              {REMOVE}
              <span className="visually-hidden"> {a.name}</span>
            </button>
          </p>
          {error && <p role="alert">{error}</p>}
        </div>
      </details>
      {review}
    </li>
  );
}
