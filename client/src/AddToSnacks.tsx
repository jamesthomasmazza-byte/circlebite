import { useState } from "react";
import { Link } from "react-router-dom";

import { addSnack, ApiRequestError, type MatchedAllergen, type Verdict } from "./lib/api";
import {
  ADD_FAILED,
  addButtonLabel,
  addedLine,
  alreadyListedLine,
  CONFIRM_ADD,
  CONFIRM_CANCEL,
  confirmHeading,
  confirmLine,
  needsConfirm,
  NOT_ON_FILE,
  snacksPath,
  VIEW_LIST,
  warnedAllergens,
} from "./lib/snackListCopy";

/**
 * "Add to Maya's snacks" under a verdict card (docs/snack-list-plan.md decisions 1 and 2; behind
 * SNACK_LIST). Managers only — Scan.tsx renders it only when the viewer manages the profile the card
 * is for — and never on a sample scan or a card with no barcode. It posts the scan's id: the server
 * takes the barcode from the scan, never from the client.
 *
 * A "Contains" or "May contain" card asks first, saying what the warning is (the verdict's label
 * and the allergens the rows name), that it stays on the list for good, and that the list won't
 * offer to shop for a Contains item. The other two verdicts add at once. A repeat (409 already_listed)
 * says so and links to the list, as a success does.
 */

export type AddToSnacksProfile = { id: string; label: string; is_self: boolean };

export type AddState =
  | { kind: "idle" }
  | { kind: "confirm" }
  | { kind: "saving" }
  | { kind: "added" }
  | { kind: "already" }
  | { kind: "error"; message: string };

export function AddToSnacks({
  profile,
  scanId,
  verdict,
  matched,
}: {
  profile: AddToSnacksProfile;
  scanId: string;
  verdict: Verdict;
  matched: MatchedAllergen[];
}) {
  const [state, setState] = useState<AddState>({ kind: "idle" });

  async function save() {
    setState({ kind: "saving" });
    try {
      await addSnack(profile.id, scanId);
      setState({ kind: "added" });
    } catch (err) {
      if (err instanceof ApiRequestError && err.message === "already_listed") setState({ kind: "already" });
      else if (err instanceof ApiRequestError && err.message === "product_not_on_file") setState({ kind: "error", message: NOT_ON_FILE });
      else setState({ kind: "error", message: ADD_FAILED });
    }
  }

  return (
    <AddToSnacksView
      state={state}
      profile={profile}
      verdict={verdict}
      matched={matched}
      onOpen={() => (needsConfirm(verdict) ? setState({ kind: "confirm" }) : void save())}
      onConfirm={() => void save()}
      onCancel={() => setState({ kind: "idle" })}
    />
  );
}

/** The markup for each state, with no state of its own, so it can be rendered under test. */
export function AddToSnacksView({
  state,
  profile,
  verdict,
  matched,
  onOpen,
  onConfirm,
  onCancel,
}: {
  state: AddState;
  profile: AddToSnacksProfile;
  verdict: Verdict;
  matched: Pick<MatchedAllergen, "allergenName" | "classification">[];
  onOpen: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (state.kind === "added" || state.kind === "already") {
    return (
      <p role="status" className="snack-add__done">
        {state.kind === "added" ? addedLine(profile) : alreadyListedLine(profile)} <Link to={snacksPath(profile.id)}>{VIEW_LIST}</Link>
      </p>
    );
  }
  if (state.kind === "confirm") {
    return (
      <div className="snack-add__confirm" role="group" aria-labelledby="snack-add-confirm-heading">
        <h3 id="snack-add-confirm-heading">{confirmHeading(verdict)}</h3>
        <p>{confirmLine(profile, verdict, warnedAllergens(matched))}</p>
        <p className="snack-add__confirm-actions">
          <button type="button" onClick={onConfirm}>
            {CONFIRM_ADD}
          </button>
          <button type="button" className="button-primary" onClick={onCancel}>
            {CONFIRM_CANCEL}
          </button>
        </p>
      </div>
    );
  }
  return (
    <div className="snack-add">
      {state.kind === "error" && <p role="alert">{state.message}</p>}
      <button type="button" className="snack-add__open" disabled={state.kind === "saving"} onClick={onOpen}>
        {state.kind === "saving" ? "Adding…" : addButtonLabel(profile)}
      </button>
    </div>
  );
}
