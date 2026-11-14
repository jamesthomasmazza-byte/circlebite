import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiRequestError, searchSnacks, searchSnacksMore, type ProfileSummary, type SnackSearchResult } from "./lib/api";
import {
  localEmptyLine,
  MORE_EMPTY,
  MORE_HEADING,
  moreFailureLine,
  pickLine,
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
export function SnackSearch({ profile }: { profile: Pick<ProfileSummary, "id" | "label" | "is_self"> }) {
  const navigate = useNavigate();
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
    try {
      const r = await searchSnacks(q.slice(0, QUERY_MAX));
      setLocal(r.results);
      setSearched(r.query);
    } catch {
      setLocal(null);
      setSearched(null);
      setError(SEARCH_FAILED);
    } finally {
      setSearching(false);
    }
  }

  async function searchMore() {
    if (!searched) return;
    setMore({ kind: "loading" });
    try {
      const r = await searchSnacksMore(searched);
      const shown = new Set((local ?? []).map((x) => x.barcode));
      setMore({ kind: "done", results: r.results.filter((x) => !shown.has(x.barcode)) });
    } catch (err) {
      setMore({ kind: "failed", line: moreFailureLine(err instanceof ApiRequestError ? err.message : "") });
    }
  }

  function pick(result: SnackSearchResult) {
    navigate(scanPathFor(profile.id), { state: scanStateFor(result.barcode) });
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
      onMore={searchMore}
      onPick={pick}
    />
  );
}

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
}) {
  const hasResults = (local?.length ?? 0) > 0 || (more.kind === "done" && more.results.length > 0);
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
          {local.length === 0 && <p className="snack-search__empty">{localEmptyLine(searched)}</p>}
          {local.length > 0 && <ResultList results={local} onPick={onPick} />}

          {more.kind === "idle" && (
            <p className="snack-search__more">
              <button type="button" onClick={onMore}>
                {SEARCH_MORE}
              </button>
            </p>
          )}
          {more.kind === "loading" && <p className="snack-search__more">{SEARCHING_MORE}</p>}
          {more.kind === "failed" && (
            <p role="status" className="snack-search__more">
              {more.line}
            </p>
          )}
          {more.kind === "done" && (
            <>
              <h3 className="snack-search__heading">{MORE_HEADING}</h3>
              {more.results.length === 0 ? (
                <p className="snack-search__empty">{MORE_EMPTY}</p>
              ) : (
                <ResultList results={more.results} onPick={onPick} />
              )}
            </>
          )}

          {hasResults && <p className="card__meta snack-search__pick">{pickLine(profile)}</p>}
        </div>
      )}
    </section>
  );
}

/** Buttons, not links: a link would put the barcode in a URL (lib/snackSearch.ts). */
function ResultList({ results, onPick }: { results: SnackSearchResult[]; onPick: (result: SnackSearchResult) => void }) {
  return (
    <ul className="snack-search__list">
      {results.map((result) => (
        <li key={result.barcode}>
          <button type="button" className="snack-search__result" onClick={() => onPick(result)}>
            <span className="snack-search__title">{resultTitle(result)}</span>
            <small className="snack-search__barcode">{result.barcode}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}
