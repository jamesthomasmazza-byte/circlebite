import type { ProfileSummary } from "./lib/api";
import { headerProfileName } from "./lib/profileLineCopy";
import { allergenChips, profileInitial } from "./lib/scanRedesign";

/**
 * Scan's own "Scanning for" pill (JT's mockup, 2026-11-06, behind SCAN_REDESIGN): in place of the
 * one-line header, on Scan only (TabShell.tsx). With one profile to scan for it's just words, not a
 * control. With two or more, a profile <select> laid over the pill lists their names only — the
 * header's own names, with "(you follow)", "(co-manager)" or "(you own)" where two read the same —
 * and choosing one sets the one value the shell holds, for the header, Scan and /scan?profile=.
 * Under it, the chosen profile's allergen names as chips, on the profile line's rules exactly
 * (lib/scanRedesign.ts allergenChips): names only, never severity or notes. The list doesn't repeat
 * them (JT, 2026-11-06): the chips already say them.
 */
export function ScanPill({
  profiles,
  chosen,
  onChoose,
}: {
  profiles: ProfileSummary[];
  chosen: ProfileSummary;
  onChoose: (id: string) => void;
}) {
  const chips = allergenChips(chosen);
  const name = headerProfileName(chosen, profiles);
  return (
    <div className="scan-pill-bar">
      {profiles.length > 1 ? (
        <label className="scan-pill">
          <span className="scan-pill__initial" aria-hidden="true">
            {profileInitial(chosen.label)}
          </span>
          <span className="scan-pill__text" aria-hidden="true">
            <span className="scan-pill__for">Scanning for</span>
            <span className="scan-pill__name">{name}</span>
          </span>
          <svg className="scan-pill__chevron" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <select className="scan-pill__select" aria-label="Scanning for" value={chosen.id} onChange={(e) => onChoose(e.target.value)}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {headerProfileName(p, profiles)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="scan-pill scan-pill--single">
          <span className="scan-pill__initial" aria-hidden="true">
            {profileInitial(chosen.label)}
          </span>
          <span className="scan-pill__text">
            <span className="scan-pill__for">Scanning for</span> <span className="scan-pill__name">{name}</span>
          </span>
        </p>
      )}
      {chips.empty ? (
        <p className="scan-chips__empty">{chips.empty}</p>
      ) : (
        <ul className="scan-chips" aria-label={`${chosen.label}'s allergens`}>
          {chips.names.map((n) => (
            <li key={n} className="scan-chip">
              {n}
            </li>
          ))}
          {chips.more > 0 && <li className="scan-chip">+{chips.more} more</li>}
        </ul>
      )}
    </div>
  );
}
