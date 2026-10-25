import type { Severity } from "./lib/api";
import { SEVERITY_CHOICES } from "./lib/severityCopy";

/**
 * Mild / Moderate / Severe, each with what it means, and none chosen until someone chooses
 * (lib/severityCopy.ts). Radios, not a select: a select always shows one option as picked.
 */
export function SeverityChoice({
  name,
  value,
  onChange,
  required,
}: {
  name: string;
  value: Severity | null;
  onChange: (severity: Severity) => void;
  required: boolean;
}) {
  return (
    <fieldset className="severity-choice">
      <legend>How severe is it?</legend>
      {SEVERITY_CHOICES.map((c) => (
        <label key={c.value} className="severity-choice__option">
          <input
            type="radio"
            name={name}
            value={c.value}
            checked={value === c.value}
            onChange={() => onChange(c.value)}
            required={required}
          />
          <span className="severity-choice__label">{c.label}</span>
          <span className="severity-choice__line">{c.line}</span>
        </label>
      ))}
    </fieldset>
  );
}
