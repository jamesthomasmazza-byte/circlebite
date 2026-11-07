import { useEffect, useState, type FormEvent } from "react";

import { AllergenPicker, EMPTY_PICK, isPicked, pickInput, type AllergenPick } from "./AllergenPicker";
import { ApiRequestError, type AllergenChoice, type AllergenInput, type Severity } from "./lib/api";
import { listedAllergenMessage } from "./lib/allergenChoiceCopy";
import { SEVERITY_REQUIRED } from "./lib/severityCopy";
import { SeverityChoice } from "./SeverityChoice";

export const ADD_AN_ALLERGEN = "Add an allergen";

/**
 * "Add an allergen" on the profile page (2026-11-05, BACKLOG item 9): a button that opens the form,
 * so the allergen list above it stays the page. A profile with no allergens starts open — it reads
 * "No listed allergens found" on every scan, so the way out isn't behind a tap (docs/principles.md,
 * Nov 5). Severity still has no default (lib/severityCopy.ts); Cancel and a successful add both close
 * the form and clear it.
 */
export function AddAllergen({
  choices,
  startOpen,
  onAdd,
  openRequest = 0,
  showOpenButton = true,
}: {
  choices: AllergenChoice[] | null;
  startOpen: boolean;
  onAdd: (input: AllergenInput) => Promise<void>;
  /** PROFILE_REDESIGN: each new value opens the form — the profile header's "Add an allergen". */
  openRequest?: number;
  /** PROFILE_REDESIGN: false when the header's button is the way in, so it isn't shown twice. */
  showOpenButton?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [pick, setPick] = useState<AllergenPick>(EMPTY_PICK);
  // Unset until a manager chooses, and unset again after each add or cancel.
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [traces, setTraces] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Removing the last allergen empties the profile: open again, for the same reason as at load.
  useEffect(() => {
    if (startOpen) setOpen(true);
  }, [startOpen]);

  useEffect(() => {
    if (openRequest > 0) setOpen(true);
  }, [openRequest]);

  function reset() {
    setPick(EMPTY_PICK);
    setSeverity(null);
    setTraces(true);
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isPicked(pick)) return;
    if (severity === null) {
      setError(SEVERITY_REQUIRED);
      return;
    }
    try {
      await onAdd({ ...pickInput(pick), severity, treatTracesAsUnsafe: traces });
      reset();
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.message === "listed_allergen"
          ? listedAllergenMessage(pick.otherName.trim(), String(err.detail.displayName))
          : "Couldn't add that allergen — it may already be on this profile.",
      );
    }
  }

  if (!open) {
    if (!showOpenButton) return null;
    return (
      <p>
        <button type="button" onClick={() => setOpen(true)}>
          {ADD_AN_ALLERGEN}
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="add-allergen">
      {choices && <AllergenPicker choices={choices} value={pick} onChange={setPick} label={ADD_AN_ALLERGEN} />}
      <SeverityChoice name="new-allergen-severity" value={severity} onChange={setSeverity} required />
      <label>
        <input type="checkbox" checked={traces} onChange={(e) => setTraces(e.target.checked)} />
        Treat traces as unsafe
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">Add allergen</button>{" "}
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(false);
        }}
      >
        Cancel
      </button>
    </form>
  );
}
