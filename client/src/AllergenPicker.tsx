import { useEffect, useState } from "react";

import { GROUP_LABEL, OTHER_OPTION_LABEL, OTHER_WARNING } from "./lib/allergenChoiceCopy";
import { fetchAllergenChoices, OTHER_ALLERGEN_KEY, type AllergenChoice } from "./lib/api";

export type AllergenPick = { key: string; otherName: string };

export const EMPTY_PICK: AllergenPick = { key: "", otherName: "" };

/** The list, fetched once per page (server matcher/allergenChoices.ts) — the client keeps no copy. */
export function useAllergenChoices(): AllergenChoice[] | null {
  const [choices, setChoices] = useState<AllergenChoice[] | null>(null);
  useEffect(() => {
    fetchAllergenChoices()
      .then((r) => setChoices(r.choices))
      .catch(() => setChoices([]));
  }, []);
  return choices;
}

/**
 * One allergen, picked from the list (2026-10-23) — free text let "treenuts" onto a profile, and the
 * matcher missed almonds under it. The hint under the picker says what a pick matches beyond its own
 * name; "Not on the list" opens a typed name, with what that matches said beside it.
 */
export function AllergenPicker({
  choices,
  value,
  onChange,
  allowOther = true,
  label = "Allergen",
  required = true,
}: {
  choices: AllergenChoice[];
  value: AllergenPick;
  onChange: (next: AllergenPick) => void;
  allowOther?: boolean;
  label?: string;
  required?: boolean;
}) {
  const picked = choices.find((c) => c.key === value.key);
  const groups = (Object.keys(GROUP_LABEL) as AllergenChoice["group"][]).map((group) => ({
    group,
    items: choices.filter((c) => c.group === group),
  }));

  return (
    <div className="allergen-picker">
      <label>
        {label}
        <select value={value.key} onChange={(e) => onChange({ ...value, key: e.target.value })} required={required}>
          <option value="" disabled>
            Choose an allergen
          </option>
          {groups.map(({ group, items }) => (
            <optgroup key={group} label={GROUP_LABEL[group]}>
              {items.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.displayName}
                </option>
              ))}
            </optgroup>
          ))}
          {allowOther && <option value={OTHER_ALLERGEN_KEY}>{OTHER_OPTION_LABEL}</option>}
        </select>
      </label>
      {picked?.hint && <p className="allergen-picker__hint">{picked.hint}</p>}
      {value.key === OTHER_ALLERGEN_KEY && (
        <>
          <label>
            Allergen name
            <input value={value.otherName} onChange={(e) => onChange({ ...value, otherName: e.target.value })} required />
          </label>
          <p className="allergen-picker__hint">{OTHER_WARNING}</p>
        </>
      )}
    </div>
  );
}

/** The request body's identity half for a pick. */
export function pickInput(pick: AllergenPick): { key: string; name?: string } {
  return pick.key === OTHER_ALLERGEN_KEY ? { key: pick.key, name: pick.otherName.trim() } : { key: pick.key };
}

/** Whether a pick is complete enough to send. */
export function isPicked(pick: AllergenPick): boolean {
  return pick.key !== "" && (pick.key !== OTHER_ALLERGEN_KEY || pick.otherName.trim().length > 0);
}
