import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { AddAllergen } from "./AddAllergen";
import { AllergenItem } from "./AllergenItem";
import { BottomSheet } from "./BottomSheet";
import { ChangeHistory } from "./ChangeHistory";
import {
  getCircle,
  getScanCount,
  getScanHistory,
  type Allergen,
  type AllergenChoice,
  type AllergenInput,
  type ProfileDetail as ProfileDetailData,
  type ProfileHistoryEntry,
  type ScanHistoryEntry,
} from "./lib/api";
import { initials, members } from "./lib/circleRedesign";
import { shortDateTime } from "./lib/dateCopy";
import {
  allergensStat,
  inCircleStat,
  MORE_OPTIONS,
  newBadge,
  profileTabs,
  roleLine,
  scansStat,
  severeOnlyNotice,
  TAB_LABEL,
  tabFromHash,
  type ProfileTab,
} from "./lib/profileRedesign";
import { DISCLAIMER, EMERGENCY, VERDICT_LABEL } from "./lib/verdictCopy";
import { ScanHistoryEntryCard } from "./routes/ScanHistory";

type Props = {
  id: string;
  profile: ProfileDetailData;
  viewerId: string | undefined;
  canManage: boolean;
  isOwner: boolean;
  showScanFor: boolean;
  choices: AllergenChoice[] | null;
  history: ProfileHistoryEntry[] | null;
  historyFailed: boolean;
  ackFailed: boolean;
  reviewFor: (a: Allergen) => ReactNode;
  onAddAllergen: (input: AllergenInput) => Promise<void>;
  onUpdateAllergen: (allergenId: string, input: Partial<AllergenInput>) => Promise<void>;
  onRemoveAllergen: (allergenId: string) => Promise<void>;
  onAcknowledge: () => void;
  onDelete: () => void;
};

/**
 * The redesigned profile page (JT's mockup, 2026-11-06, behind PROFILE_REDESIGN). A layout of the
 * same page: ProfileDetail.tsx keeps every request and rule and hands them here.
 *
 * What each role reads is unchanged. Every number comes from data this viewer already reads: the
 * allergens the page was sent (a severe-only follower's are already filtered), the circle a
 * manager already reads — never asked for a follower, whom the server 404s — and a scan count
 * from the same rows and check as their history. Changes is the owner's and co-managers' only, as
 * the server's 404 already says.
 */
export function ProfileDetailRedesign(p: Props) {
  const { profile, id } = p;
  const location = useLocation();
  const navigate = useNavigate();
  const tabs = profileTabs(profile.access);
  const tab = tabFromHash(location.hash, tabs);

  const [inCircle, setInCircle] = useState<number | null>(null);
  const [scanCount, setScanCount] = useState<number | null>(null);
  const [scans, setScans] = useState<ScanHistoryEntry[] | null>(null);
  const [scansFailed, setScansFailed] = useState(false);
  const [openScan, setOpenScan] = useState<ScanHistoryEntry | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Each tap of the header's "Add an allergen" opens today's add form, the one way in (JT, 2026-11-06).
  const [addRequest, setAddRequest] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    // The circle only for its managers: a follower is never asked, and the server would 404 anyway.
    if (p.canManage) {
      getCircle(id)
        .then((c) => live && setInCircle(members(c, p.viewerId).length))
        .catch(() => live && setInCircle(null));
    }
    getScanCount(id)
      .then((r) => live && setScanCount(r.count))
      .catch(() => live && setScanCount(null));
    getScanHistory(id)
      .then((h) => live && setScans(h))
      .catch(() => live && setScansFailed(true));
    return () => {
      live = false;
    };
  }, [id, p.canManage, p.viewerId]);

  // Close the ⋯ menu on a tap outside it.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  function choose(next: ProfileTab) {
    navigate({ hash: next }, { replace: true });
  }

  const unseen = (p.history ?? []).filter((e) => e.unseen).length;
  const hasMenu = p.isOwner; // Its one item, Delete, is the owner's alone today.
  const notice = severeOnlyNotice(profile.access, profile.label);

  return (
    <main className="profile-redesign profile-page">
      <div className="profile-topbar">
        <Link to="/profiles" className="profile-topbar__back">
          <span aria-hidden="true">‹</span> Profiles
        </Link>
        <h1 className="profile-topbar__title">{profile.label}</h1>
        {hasMenu ? (
          <div className="profile-menu" ref={menuRef}>
            <button
              type="button"
              className="profile-menu__button"
              aria-label={MORE_OPTIONS(profile.label)}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span aria-hidden="true">⋯</span>
            </button>
            {menuOpen && (
              <div className="profile-menu__list">
                {/* Today's delete, with today's confirm step (ProfileDetail.tsx handleDeleteProfile). */}
                <button
                  type="button"
                  className="button-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    p.onDelete();
                  }}
                >
                  Delete this profile
                </button>
              </div>
            )}
          </div>
        ) : (
          <span className="profile-topbar__spacer" aria-hidden="true" />
        )}
      </div>

      <div className="profile-hero">
        <div className="profile-hero__avatar" aria-hidden="true">
          {initials(profile.label)}
        </div>
        <ul className="profile-hero__stats">
          <li>{allergensStat(profile.allergens.length)}</li>
          {p.canManage && inCircle !== null && <li>{inCircleStat(inCircle)}</li>}
          {scanCount !== null && <li>{scansStat(scanCount)}</li>}
        </ul>
      </div>
      <p className="profile-hero__name">{profile.label}</p>
      <p className="profile-hero__role">{roleLine(profile.access)}</p>

      {(p.showScanFor || p.canManage) && (
        <p className="profile-hero__actions">
          {/* Chooses this profile for Scan (TabShell.tsx); only with 2+ profiles to scan for. */}
          {p.showScanFor && (
            <Link to={`/scan?profile=${id}`} className="button-link">
              Scan for {profile.label}
            </Link>
          )}
          {p.canManage && (
            <button
              type="button"
              onClick={() => {
                setAddRequest((n) => n + 1);
                choose("allergens");
              }}
            >
              Add an allergen
            </button>
          )}
        </p>
      )}

      <div className="profile-tabs" role="tablist" aria-label={`${profile.label}'s profile`}>
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => choose(t)}
          >
            {TAB_LABEL[t]}
            {t === "changes" && unseen > 0 && <span className="profile-tabs__badge">{newBadge(unseen)}</span>}
          </button>
        ))}
      </div>

      {tab === "allergens" && (
        <section role="tabpanel" id="panel-allergens" aria-labelledby="tab-allergens">
          {notice && <p role="note">{notice}</p>}
          <ul className="card-list allergen-cards">
            {profile.allergens.map((a) => (
              <AllergenItem
                key={a.id}
                allergen={a}
                canManage={p.canManage}
                onUpdate={(input) => p.onUpdateAllergen(a.id, input)}
                onRemove={() => p.onRemoveAllergen(a.id)}
                review={p.reviewFor(a)}
              />
            ))}
          </ul>
          {p.canManage && (
            <AddAllergen
              choices={p.choices}
              startOpen={profile.allergens.length === 0}
              openRequest={addRequest}
              showOpenButton={false}
              onAdd={p.onAddAllergen}
            />
          )}
        </section>
      )}

      {tab === "scans" && (
        <section role="tabpanel" id="panel-scans" aria-labelledby="tab-scans">
          {scansFailed && <p role="alert">Couldn't load scan history — you may not have access to this profile.</p>}
          {scans && scans.length === 0 && <p>No scans for {profile.label} yet.</p>}
          {scans && scans.length > 0 && (
            <ul className="scan-tiles">
              {scans.map((s) => {
                const shown = s.effective ?? s.original;
                // The allergens the history card itself shows as rows: neither clear nor unchecked.
                const names = shown.matched_allergens
                  .filter((m) => m.classification !== "clear" && m.classification !== "unchecked")
                  .map((m) => m.allergenName);
                return (
                  <li key={s.id}>
                    <button type="button" className="scan-tile" onClick={() => setOpenScan(s)}>
                      <span className="history-entry__verdict scan-tile__verdict" data-verdict={shown.result}>
                        {VERDICT_LABEL[shown.result]}
                      </span>
                      <span className="scan-tile__name">{s.product_name ?? "Unknown product"}</span>
                      {names.length > 0 && <span className="scan-tile__allergens">{names.join(", ")}</span>}
                      <time className="scan-tile__date" dateTime={s.created_at}>
                        {shortDateTime(s.created_at)}
                      </time>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {/* Under every list of verdicts, as on the history page (Oct 1). */}
          <div role="note" className="verdict-card__disclaimer scan-history__disclaimer">
            <p>{DISCLAIMER}</p>
            <p>
              <strong>{EMERGENCY}</strong>
            </p>
          </div>
          {/* A tile opens today's history card for that scan, in full. */}
          <BottomSheet open={openScan !== null} onClose={() => setOpenScan(null)} labelledBy="scan-sheet-title">
            <h2 id="scan-sheet-title" className="visually-hidden">
              Scan details
            </h2>
            {openScan && (
              <ul className="card-list">
                <ScanHistoryEntryCard scan={openScan} profileLabel={profile.label} />
              </ul>
            )}
          </BottomSheet>
        </section>
      )}

      {tab === "changes" && p.canManage && (
        <section role="tabpanel" id="panel-changes" aria-labelledby="tab-changes">
          <ChangeHistory
            profileId={id}
            profile={{ label: profile.label, isSelf: profile.is_self }}
            choices={p.choices ?? []}
            history={p.history}
            failed={p.historyFailed}
            ackFailed={p.ackFailed}
            onAcknowledge={p.onAcknowledge}
          />
        </section>
      )}
    </main>
  );
}
