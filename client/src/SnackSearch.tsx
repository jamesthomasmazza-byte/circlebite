import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import {
  addSnack,
  ApiRequestError,
  createScan,
  searchSnacks,
  searchSnacksMore,
  type MatchedAllergen,
  type ProfileSummary,
  type SnackSearchResult,
  type Verdict,
} from "./lib/api";
import {
  ADD_FAILED,
  addedLine,
  alreadyListedLine,
  CONFIRM_ADD,
  CONFIRM_CANCEL,
  confirmHeading,
  confirmLine,
  needsConfirm,
  NOT_ON_FILE,
  warnedAllergens,
} from "./lib/snackListCopy";
import {
  ADD_ADDING,
  ADD_BUTTON,
  ADD_CHECKING,
  localEmptyLine,
  MORE_EMPTY,
  nothingAnywhereLine,
  MORE_HEADING,
  moreFailureLine,
  pickLine,
  pickLineWithAdd,
  QUERY_MAX,
  QUERY_MIN,
  resultTitle,
  scanPathFor,
  scanStateFor,
  SEARCH_BUTTON,
  SEARCH_FAILED,
  SEARCH_LABEL,
  SEARCH_MORE,
  SEARCH_PLACEHOLDER,
  SEARCH_REGION,
  SEARCHING,
  SEARCHING_MORE,
  TOO_SHORT,
} from "./lib/snackSearch";

/**
 * The search box on the Snacks tab (docs/snack-list-plan.md addendum, 2026-11-14; behind
 * SNACK_SEARCH). Our own product records first; "Search more" asks Open Food Facts through the
 * server, which caches and limits it. Results are products to open, never verdicts: tapping one goes
 * to Scan for this profile with the barcode in location state (lib/snackSearch.ts), where the
 * existing typed-barcode scan draws the card, its warnings and "Add to <name>'s snacks". Nothing
 * here adds to any list.
 */
export function SnackSearch({
  profile,
  canManage = false,
  onAdded,
}: {
  profile: Pick<ProfileSummary, "id" | "label" | "is_self">;
  /** Owner or co-manager: each result gets an Add button (JT, Nov 14). */
  canManage?: boolean;
  /** After an item is added, so the list under the box refreshes. */
  onAdded?: () => void;
}) {
  const navigate = useNavigate();
  const [adds, setAdds] = useState<Record<string, AddState>>({});
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [local, setLocal] = useState<SnackSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState<MoreState>({ kind: "idle" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const q = query.trim().replace(/\s+/g, " ");
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (q.length < QUERY_MIN) {
      setError(TOO_SHORT);
      return;
    }
    setError(null);
    setSearching(true);
    setMore({ kind: "idle" });
    let found: SnackSearchResult[] | null = null;
    let searchedQuery: string | null = null;
    try {
      const r = await searchSnacks(q.slice(0, QUERY_MAX));
      found = r.results;
      searchedQuery = r.query;
      setLocal(found);
      setSearched(searchedQuery);
    } catch {
      setLocal(null);
      setSearched(null);
      setError(SEARCH_FAILED);
    } finally {
      setSearching(false);
    }
    // No local match: ask Open Food Facts at once rather than waiting for a tap (JT, Nov 14). Same
    // route, same limits, same waiting line. With local results, "Search more" stays a tap away.
    if (found && searchedQuery && found.length === 0) await searchMore(searchedQuery, found);
  }

  async function searchMore(query = searched, shownResults = local) {
    if (!query) return;
    setMore({ kind: "loading" });
    try {
      const r = await searchSnacksMore(query);
      const shown = new Set((shownResults ?? []).map((x) => x.barcode));
      setMore({ kind: "done", results: r.results.filter((x) => !shown.has(x.barcode)) });
    } catch (err) {
      setMore({ kind: "failed", line: moreFailureLine(err instanceof ApiRequestError ? err.message : "") });
    }
  }

  function pick(result: SnackSearchResult) {
    navigate(scanPathFor(profile.id), { state: scanStateFor(result.barcode) });
  }

  const setAdd = (barcode: string, state: AddState) => setAdds((prev) => ({ ...prev, [barcode]: state }));

  // Add (JT, Nov 14): the same scan the Scan page's typed form runs, for this profile — same path,
  // same layers, same scan row — then the existing add by scan id, so the list's barcode is the scan
  // row's. A warning verdict gets the card's own confirm step inline first (plan decision 2).
  async function startAdd(result: SnackSearchResult) {
    setAdd(result.barcode, { kind: "scanning" });
    try {
      const scan = await createScan(profile.id, result.barcode);
      const verdict = scan.effective?.result ?? scan.result;
      const matched = scan.effective?.matched_allergens ?? scan.matched_allergens;
      if (needsConfirm(verdict)) setAdd(result.barcode, { kind: "confirm", scanId: scan.id, verdict, matched });
      else await finishAdd(result.barcode, scan.id);
    } catch {
      setAdd(result.barcode, { kind: "error", line: ADD_FAILED });
    }
  }

  async function finishAdd(barcode: string, scanId: string) {
    setAdd(barcode, { kind: "adding" });
    try {
      await addSnack(profile.id, scanId);
      setAdd(barcode, { kind: "added" });
      onAdded?.();
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.message : "";
      if (code === "already_listed") setAdd(barcode, { kind: "already" });
      else setAdd(barcode, { kind: "error", line: code === "product_not_on_file" ? NOT_ON_FILE : ADD_FAILED });
    }
  }

  return (
    <SnackSearchView
      profile={profile}
      query={query}
      onQueryChange={setQuery}
      onSubmit={submit}
      searching={searching}
      error={error}
      searched={searched}
      local={local}
      more={more}
      onMore={() => void searchMore()}
      onPick={pick}
      canManage={canManage}
      adds={adds}
      onAdd={(r) => void startAdd(r)}
      onConfirmAdd={(r) => {
        const s = adds[r.barcode];
        if (s?.kind === "confirm") void finishAdd(r.barcode, s.scanId);
      }}
      onCancelAdd={(r) => setAdd(r.barcode, { kind: "idle" })}
    />
  );
}

/** One result's Add, by barcode. */
export type AddState =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "confirm"; scanId: string; verdict: Verdict; matched: Pick<MatchedAllergen, "allergenName" | "classification">[] }
  | { kind: "adding" }
  | { kind: "added" }
  | { kind: "already" }
  | { kind: "error"; line: string };

export type MoreState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; results: SnackSearchResult[] }
  | { kind: "failed"; line: string };

/** The markup, with every state passed in, so it renders under test. */
export function SnackSearchView({
  profile,
  query,
  onQueryChange,
  onSubmit,
  searching,
  error,
  searched,
  local,
  more,
  onMore,
  onPick,
  canManage = false,
  adds = {},
  onAdd = () => {},
  onConfirmAdd = () => {},
  onCancelAdd = () => {},
}: {
  profile: Pick<ProfileSummary, "id" | "label" | "is_self">;
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  searching: boolean;
  error: string | null;
  searched: string | null;
  local: SnackSearchResult[] | null;
  more: MoreState;
  onMore: () => void;
  onPick: (result: SnackSearchResult) => void;
  canManage?: boolean;
  adds?: Record<string, AddState>;
  onAdd?: (result: SnackSearchResult) => void;
  onConfirmAdd?: (result: SnackSearchResult) => void;
  onCancelAdd?: (result: SnackSearchResult) => void;
}) {
  const hasResults = (local?.length ?? 0) > 0 || (more.kind === "done" && more.results.length > 0);
  const listProps = { profile, onPick, canManage, adds, onAdd, onConfirmAdd, onCancelAdd };
  return (
    <section className="snack-search" aria-label={SEARCH_REGION}>
      <form className="snack-search__form" onSubmit={onSubmit} noValidate>
        <label>
          {SEARCH_LABEL}
          <input
            type="search"
            value={query}
            maxLength={QUERY_MAX}
            placeholder={SEARCH_PLACEHOLDER}
            autoComplete="off"
            enterKeyHint="search"
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </label>
        <button type="submit" disabled={searching}>
          {searching ? SEARCHING : SEARCH_BUTTON}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}

      {searched !== null && local !== null && (
        <div className="snack-search__results">
          {/* No local match: Open Food Facts is already being asked, so the only line is the waiting
              one, then its answer. The local-empty line shows only if that ask failed. */}
          {local.length === 0 && (more.kind === "idle" || more.kind === "failed") && <p className="snack-search__empty">{localEmptyLine(searched)}</p>}
          {local.length > 0 && <ResultList results={local} {...listProps} />}

          {more.kind === "idle" && local.length > 0 && (
            <p className="snack-search__more">
              <button type="button" onClick={onMore}>
                {SEARCH_MORE}
              </button>
            </p>
          )}
          {/* The working state, for up to the server's 15-second wait: the button is gone and this line
              is read out at once (role=status, aria-busy), so a tap isn't repeated. */}
          {more.kind === "loading" && (
            <p role="status" aria-busy="true" className="snack-search__more snack-search__waiting">
              {SEARCHING_MORE}
            </p>
          )}
          {more.kind === "failed" && (
            <p role="status" className="snack-search__more">
              {more.line}
            </p>
          )}
          {more.kind === "done" && local.length === 0 && more.results.length === 0 && (
            <p className="snack-search__empty">{nothingAnywhereLine(searched)}</p>
          )}
          {more.kind === "done" && (local.length > 0 || more.results.length > 0) && (
            <>
              <h3 className="snack-search__heading">{MORE_HEADING}</h3>
              {more.results.length === 0 ? (
                <p className="snack-search__empty">{MORE_EMPTY}</p>
              ) : (
                <ResultList results={more.results} {...listProps} />
              )}
            </>
          )}

          {hasResults && <p className="card__meta snack-search__pick">{canManage ? pickLineWithAdd(profile) : pickLine(profile)}</p>}
        </div>
      )}
    </section>
  );
}

/** Buttons, not links: a link would put the barcode in a URL (lib/snackSearch.ts). */
function ResultList({
  results,
  profile,
  onPick,
  canManage,
  adds,
  onAdd,
  onConfirmAdd,
  onCancelAdd,
}: {
  results: SnackSearchResult[];
  profile: Pick<ProfileSummary, "id" | "label" | "is_self">;
  onPick: (result: SnackSearchResult) => void;
  canManage: boolean;
  adds: Record<string, AddState>;
  onAdd: (result: SnackSearchResult) => void;
  onConfirmAdd: (result: SnackSearchResult) => void;
  onCancelAdd: (result: SnackSearchResult) => void;
}) {
  return (
    <ul className="snack-search__list">
      {results.map((result) => {
        const add = adds[result.barcode] ?? { kind: "idle" };
        const busy = add.kind === "scanning" || add.kind === "adding";
        return (
          <li key={result.barcode}>
            <div className="snack-search__row">
              <button type="button" className="snack-search__result" onClick={() => onPick(result)}>
                <span className="snack-search__title">{resultTitle(result)}</span>
                <small className="snack-search__barcode">{result.barcode}</small>
              </button>
              {canManage && add.kind !== "added" && add.kind !== "already" && add.kind !== "confirm" && (
                <button type="button" className="snack-search__add" disabled={busy} onClick={() => onAdd(result)} aria-label={`${ADD_BUTTON} ${resultTitle(result)}`}>
                  {add.kind === "scanning" ? ADD_CHECKING : add.kind === "adding" ? ADD_ADDING : ADD_BUTTON}
                </button>
              )}
            </div>
            {add.kind === "confirm" && (
              <div className="snack-add__confirm snack-search__confirm" role="group" aria-label={confirmHeading(add.verdict)}>
                <h4>{confirmHeading(add.verdict)}</h4>
                <p>{confirmLine(profile, add.verdict, warnedAllergens(add.matched))}</p>
                <p className="snack-add__confirm-actions">
                  <button type="button" onClick={() => onConfirmAdd(result)}>
                    {CONFIRM_ADD}
                  </button>
                  <button type="button" className="button-primary" onClick={() => onCancelAdd(result)}>
                    {CONFIRM_CANCEL}
                  </button>
                </p>
              </div>
            )}
            {add.kind === "added" && (
              <p role="status" className="snack-search__status">
                {addedLine(profile)}
              </p>
            )}
            {add.kind === "already" && (
              <p role="status" className="snack-search__status">
                {alreadyListedLine(profile)}
              </p>
            )}
            {add.kind === "error" && (
              <p role="alert" className="snack-search__status">
                {add.line}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
