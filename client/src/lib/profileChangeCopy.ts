import type { UnseenProfileChanges } from "./api";

// Plain functions, no JSX — the wording an owner reads about changes other people made to a
// profile they own (Prof. Yoest's Oct 1 conditions), kept here so it can be tested
// (`npm test -w client`). Every sentence says what actually happened and nothing more: a downgrade
// changed one person's view of one scan, not the profile (docs/principles.md, Sept 29 2026
// precedent — confirmations state what the server says happened).

/** "Sam", "Sam and Lee", "Sam, Lee and Kim", "Sam, Lee and 2 others". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
}

/** "Maya's", or "your" for the owner's own profile. */
export function profilePossessive(p: Pick<UnseenProfileChanges, "label" | "isSelf">): string {
  return p.isSelf ? "your" : `${p.label}'s`;
}

/**
 * Who made the unacknowledged entries. Names as recorded; a change with no acting user is "someone
 * outside the app", never a guessed person, and an actor whose name wasn't recorded is said to be
 * exactly that.
 */
export function unseenActors(u: Pick<UnseenProfileChanges, "actorNames" | "outsideApp" | "unnamedActor">): string {
  const who = [...u.actorNames];
  if (u.unnamedActor) who.push("someone whose name wasn't recorded");
  if (u.outsideApp) who.push("someone outside the app");
  const joined = joinNames(who);
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/**
 * The dashboard banner's sentence for one profile. A profile change and a disputed warning are
 * named separately because they are different claims: the first changed what the profile says
 * about the child for everyone; the second changed only the reporter's own view of one scan.
 */
export function unseenBannerLine(u: UnseenProfileChanges): string {
  const whose = profilePossessive(u);
  const forWhom = u.isSelf ? "you" : u.label;
  const what =
    u.hasProfileChange && u.hasDowngrade
      ? `changed ${whose} profile and disputed a scan warning`
      : u.hasProfileChange
        ? `changed ${whose} profile`
        : `disputed a warning on a scan for ${forWhom}`;
  const updates = `${u.count} ${u.count === 1 ? "update" : "updates"} you haven't reviewed`;
  return `${unseenActors(u)} ${what} — ${updates}.`;
}
