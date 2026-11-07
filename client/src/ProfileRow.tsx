import { Link } from "react-router-dom";

import type { ProfileSummary } from "./lib/api";
import { initials } from "./lib/circleRedesign";
import { allergenLine } from "./lib/profileLineCopy";
import { roleTag } from "./lib/profileRedesign";
import { badgeLabel } from "./lib/tabs";

/**
 * One profile on the redesigned Profile tab (JT's mockup, 2026-11-06, behind PROFILE_REDESIGN): an
 * initials avatar (never a photo), the name, its allergen names on the profile line's rules, and a
 * tag. A managed profile's tag is how you hold it; a severe-only follow says so. The red count is
 * the profile's unacknowledged changes — the owner's, the Profile tab badge's own count.
 */
export function ProfileRow({ profile: p, followed, unseen }: { profile: ProfileSummary; followed: boolean; unseen: number }) {
  const tag = followed ? (p.share_level === "severe_only" ? "Severe allergens only" : null) : roleTag(p.relationship);
  return (
    <li className="profile-row">
      <Link to={`/profiles/${p.id}`} className="profile-row__link">
        <span className="profile-row__avatar" aria-hidden="true">
          {initials(p.label)}
          {unseen > 0 && <span className="profile-row__badge">{unseen > 99 ? "99+" : unseen}</span>}
        </span>
        <span className="profile-row__text">
          <span className="profile-row__name">{p.label}</span>
          <span className="profile-line">{allergenLine(p)}</span>
        </span>
        {tag && <span className="profile-row__tag">{tag}</span>}
        {unseen > 0 && <span className="visually-hidden">, {badgeLabel(unseen)}</span>}
      </Link>
    </li>
  );
}
