import type { AllergenImage, ProfileHistoryEntry, ProfileImage, UnseenProfileChanges, Verdict } from "./api";
import { VERDICT_LABEL } from "./verdictCopy";

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

// ---- One history entry ----

/** What a parent reads for one entry, in parts the page lays out. Rendered from the stored
 *  before/after, never stored as prose, so it can't drift from what was recorded. */
export type ChangeDescription = {
  /** "Sam (co-manager) removed Peanut". */
  headline: string;
  /** What it was and what it became — for a removal, the full allergen as it was. */
  details: string[];
  /** Something the parent should go and check, not just read. Only for a rename today. */
  check: string | null;
  /** What this does to what people are told. */
  consequences: string[];
  /** Where a report stands now, read live — e.g. reviewed and not accepted. */
  status: string | null;
};

type ProfileRef = { label: string; isSelf: boolean };

/** "Sam (co-manager)", "You", "Someone outside the app". Never a guess at who. */
export function entryActor(e: Pick<ProfileHistoryEntry, "actorIsViewer" | "actorKnown" | "actorName" | "actorRole">): string {
  if (e.actorIsViewer) return "You";
  if (!e.actorKnown) return "Someone outside the app";
  const name = e.actorName ?? "Someone whose name wasn't recorded";
  const role = e.actorRole === "co_manager" ? " (co-manager)" : e.actorRole === "owner" ? " (owner)" : "";
  return `${name}${role}`;
}

/** The same person later in a sentence: "Sam", "you", "the reporter". */
function actorShort(e: Pick<ProfileHistoryEntry, "actorIsViewer" | "actorKnown" | "actorName">): string {
  if (e.actorIsViewer) return "you";
  if (e.actorKnown && e.actorName) return e.actorName;
  return "the reporter";
}

function actorPossessive(e: Pick<ProfileHistoryEntry, "actorIsViewer" | "actorKnown" | "actorName">): string {
  if (e.actorIsViewer) return "your";
  return `${actorShort(e)}'s`;
}

function quoted(text: string | null): string {
  return text === null || text === "" ? "(none)" : `“${text}”`;
}

const SEVERITY_RANK = { mild: 0, moderate: 1, severe: 2 } as const;

function tracesPhrase(treatAsUnsafe: boolean): string {
  return treatAsUnsafe ? "“may contain” treated as unsafe" : "“may contain” shown as a caution";
}

/** "severe; “may contain” treated as unsafe; note: “carries EpiPen”" — the whole allergen. */
export function describeAllergen(a: AllergenImage): string {
  const parts = [a.severity, tracesPhrase(a.treat_traces_as_unsafe)];
  if (a.notes) parts.push(`note: ${quoted(a.notes)}`);
  return parts.join("; ");
}

function describeAllergenEdit(e: ProfileHistoryEntry, p: ProfileRef, b: AllergenImage, a: AllergenImage): ChangeDescription {
  const details: string[] = [];
  const consequences: string[] = [];
  let check: string | null = null;
  const forWhom = p.isSelf ? "you" : p.label;

  if (b.name !== a.name) {
    details.push(`Renamed ${quoted(b.name)} to ${quoted(a.name)}.`);
    // The most dangerous edit in the app: matching is by name, so a rename can quietly stop a
    // warning while the profile still looks complete. This line asks for action, not attention.
    check =
      `Check that ${quoted(a.name)} is still the allergen you mean. Scans match allergens by name, so if this ` +
      `name is misspelled or different, scans for ${forWhom} will stop warning about ${b.name} with no other sign.`;
  }
  if (b.severity !== a.severity) {
    details.push(`Severity: ${b.severity} → ${a.severity}.`);
    const wasSevere = b.severity === "severe";
    const isSevere = a.severity === "severe";
    if (wasSevere && !isSevere) {
      consequences.push(`People who follow ${p.isSelf ? "you" : p.label} for severe allergens only no longer see ${a.name}.`);
    } else if (!wasSevere && isSevere) {
      consequences.push(`People who follow ${p.isSelf ? "you" : p.label} for severe allergens only now see ${a.name}.`);
    } else if (SEVERITY_RANK[a.severity] < SEVERITY_RANK[b.severity]) {
      consequences.push(`${a.name} is now marked less severe.`);
    }
  }
  if (b.treat_traces_as_unsafe !== a.treat_traces_as_unsafe) {
    details.push(`Traces: ${tracesPhrase(b.treat_traces_as_unsafe)} → ${tracesPhrase(a.treat_traces_as_unsafe)}.`);
    consequences.push(
      a.treat_traces_as_unsafe
        ? `A “may contain ${a.name}” label now shows as “contains”.`
        : `A “may contain ${a.name}” label now shows as a caution, not “contains”.`,
    );
  }
  if ((b.notes ?? "") !== (a.notes ?? "")) {
    details.push(`Note: ${quoted(b.notes)} → ${quoted(a.notes)}.`);
  }
  return { headline: `${entryActor(e)} changed ${b.name}`, details, check, consequences, status: null };
}

function describeProfileEdit(e: ProfileHistoryEntry, p: ProfileRef, b: ProfileImage, a: ProfileImage): ChangeDescription {
  const details: string[] = [];
  const consequences: string[] = [];
  if (b.label !== a.label) details.push(`Name: ${quoted(b.label)} → ${quoted(a.label)}.`);
  if ((b.notes ?? "") !== (a.notes ?? "")) details.push(`Profile note: ${quoted(b.notes)} → ${quoted(a.notes)}.`);
  if (b.default_treat_traces_as_unsafe !== a.default_treat_traces_as_unsafe) {
    details.push(
      `Profile-wide traces default: ${tracesPhrase(b.default_treat_traces_as_unsafe)} → ${tracesPhrase(a.default_treat_traces_as_unsafe)}.`,
    );
    // Only used when a profile is first created with allergens (routes/profiles.ts) — say so
    // rather than imply it changed anything about the allergens already on the profile.
    consequences.push("Each allergen keeps its own traces setting; this didn't change any of them.");
  }
  return { headline: `${entryActor(e)} changed ${profilePossessive(p)} profile`, details, check: null, consequences, status: null };
}

function describeDowngrade(e: ProfileHistoryEntry, p: ProfileRef): ChangeDescription {
  const d = e.downgrade!;
  const product = d.productName ? `${d.productName}${d.productBrand ? ` (${d.productBrand})` : ""}` : "a product";
  const who = entryActor(e);
  const short = actorShort(e);
  const theirs = actorPossessive(e);
  const sees = e.actorIsViewer ? "see" : "sees";
  const profileWhose = capitalize(profilePossessive(p));
  const othersNow = e.actorIsViewer
    ? `${profileWhose} profile and what everyone else sees are unchanged.`
    : `${profileWhose} profile, and what you and everyone else see, are unchanged.`;
  const othersEver = e.actorIsViewer
    ? `${profileWhose} profile and what everyone else saw were never changed.`
    : `${profileWhose} profile, and what you and everyone else saw, were never changed.`;

  const headline =
    d.correctionType === "flag_wrong"
      ? `${who} reported ${d.allergen ?? "an allergen"} isn't in ${product}`
      : d.correctionType === "wrong_product"
        ? `${who} reported that a scan of ${product} matched the wrong product`
        : `${who} reported a problem with the verdict on a scan of ${product}`;

  const details: string[] = [];
  if (d.verdictAtReport && d.verdictAtReport in VERDICT_LABEL) {
    details.push(`The card had said: ${VERDICT_LABEL[d.verdictAtReport as Verdict]}.`);
  }
  if (d.note) details.push(`Note: ${quoted(d.note)}`);

  // What the report did to that one person's card. Kept in full on every downgrade entry: it is
  // what Prof. Yoest's condition rests on — the owner learns a co-manager is being told something
  // different, without being told their child's profile changed when it didn't.
  const effectNow =
    d.correctionType === "flag_wrong"
      ? `${capitalize(theirs)} card no longer warns about ${d.allergen ?? "it"}.`
      : d.correctionType === "wrong_product"
        ? `${capitalize(theirs)} card for it now shows “${VERDICT_LABEL.unable_to_confirm}” instead of its warnings.`
        : null;

  const consequences: string[] = [];
  let status: string | null = null;
  if (d.currentStatus === "rejected") {
    // A rejected removal stops applying (corrections/applyCorrections.ts) — the entry must not go on
    // describing a dispute that was refused.
    consequences.push(`This had changed only what ${short} saw for that one scan. ${othersEver}`);
    status =
      `Reviewed and not accepted. ${capitalize(theirs)} card shows ` +
      (d.correctionType === "wrong_product" ? "its warnings again." : "the warning again.");
  } else {
    consequences.push(
      `This changed only what ${short} ${sees} for that one scan.${effectNow ? ` ${effectNow}` : ""} ${othersNow}`,
    );
    if (d.currentStatus === null) status = "The report itself is no longer on record.";
  }
  return { headline, details, check: null, consequences, status };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function describeChange(e: ProfileHistoryEntry, p: ProfileRef): ChangeDescription {
  const forWhom = p.isSelf ? "you" : p.label;
  switch (e.kind) {
    case "allergen_added": {
      const a = e.after as AllergenImage;
      return {
        headline: `${entryActor(e)} added ${a.name}`,
        details: [`${capitalize(describeAllergen(a))}.`],
        check: null,
        consequences: [`Scans for ${forWhom} now check for ${a.name}.`],
        status: null,
      };
    }
    case "allergen_removed": {
      const b = e.before as AllergenImage;
      return {
        headline: `${entryActor(e)} removed ${b.name}`,
        details: [`It was: ${describeAllergen(b)}.`],
        check: null,
        consequences: [`Scans for ${forWhom} no longer check for ${b.name}.`],
        status: null,
      };
    }
    case "allergen_edited":
      return describeAllergenEdit(e, p, e.before as AllergenImage, e.after as AllergenImage);
    case "profile_edited":
      return describeProfileEdit(e, p, e.before as ProfileImage, e.after as ProfileImage);
    case "downgrade_reported":
      return describeDowngrade(e, p);
  }
}
