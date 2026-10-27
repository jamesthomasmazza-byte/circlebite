import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useOutletContext } from "react-router-dom";

import { LandingNotices, type NoticeData } from "./LandingNotices";
import { getUnseenChanges, listCircleRequests, listProfiles, type CircleRequest, type ProfileSummary } from "./lib/api";
import { useAuth } from "./lib/AuthContext";
import { REQUESTS_HEADING, requestBadgeLabel, requestNoticeLine } from "./lib/circleRequestCopy";
import { headerProfileName } from "./lib/profileLineCopy";
import {
  activeTab,
  badgeLabel,
  LANDING_PATH,
  noticesShownOn,
  profileBadgeCount,
  requestedProfile,
  scanningForId,
  TAB_LABEL,
  TAB_PATH,
  type Tab,
} from "./lib/tabs";

/** What the shell hands the page: the profile chosen for scanning (lib/tabs.ts scanningForId), and
 *  the owner's follow requests with a way to re-read them after one is decided (the Circle tab). */
export type ScanningFor = {
  chosenProfileId: string | null;
  chooseProfile: (id: string) => void;
  requests: CircleRequest[];
  refreshRequests: () => void;
};

export function useScanningFor(): ScanningFor {
  return useOutletContext<ScanningFor>();
}

const EMPTY: NoticeData = { unseen: [], unseenFailed: false, needsReview: [] };

/**
 * Every signed-in page sits in this (main.tsx): the page, then the bottom tab bar — Profile · Scan ·
 * Circle (2026-10-23). Sign-in lands on Scan (lib/tabs.ts LANDING_PATH), which skips the old
 * dashboard, so its two notices live here: above Scan and the Profile tab's own page, and as a count
 * on the Profile tab everywhere. Re-read on every navigation, so acknowledging changes on a profile
 * page clears the badge by the time you're back.
 *
 * Above everything, a slim header: the wordmark and the profile Scan checks for (2026-10-25), so
 * the profile you're acting for is on every screen. One line, then the notices — never between
 * the notices and the top of the landing screen's content (Condition 2).
 */
export function TabShell() {
  const { pathname, search } = useLocation();
  const [notices, setNotices] = useState<NoticeData>(EMPTY);
  const [badge, setBadge] = useState(0);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [chosenProfileId, setChosenProfileId] = useState<string | null>(() => requestedProfile(search));
  // Follow requests waiting on this owner (CIRCLE_REQUESTS): a line on Scan after Condition 2's
  // notices, never before them, and a badge on the Circle tab. Gone only when each is approved or
  // declined. Empty for anyone who owns nothing, and while the switch is off.
  const { circleRequestsEnabled } = useAuth();
  const [requests, setRequests] = useState<CircleRequest[]>([]);
  const [requestsRead, setRequestsRead] = useState(0);

  // A "Scan for" button arriving with ?profile=<id> is a choice, even while the shell is mounted.
  useEffect(() => {
    const requested = requestedProfile(search);
    if (requested) setChosenProfileId(requested);
  }, [search]);

  useEffect(() => {
    let live = true;
    Promise.allSettled([getUnseenChanges(), listProfiles()]).then(([unseen, profiles]) => {
      if (!live) return;
      const unseenRows = unseen.status === "fulfilled" ? unseen.value : [];
      const managed = profiles.status === "fulfilled" ? profiles.value.managed : [];
      setProfiles(profiles.status === "fulfilled" ? [...managed, ...profiles.value.followed] : []);
      setNotices({
        unseen: unseenRows,
        unseenFailed: unseen.status === "rejected",
        needsReview: managed.filter((p) => (p.allergens_needing_review ?? 0) > 0),
      });
      setBadge(profileBadgeCount(unseenRows, managed));
    });
    return () => {
      live = false;
    };
  }, [pathname]);

  useEffect(() => {
    let live = true;
    if (!circleRequestsEnabled) {
      setRequests([]);
      return;
    }
    listCircleRequests()
      .then((r) => live && setRequests(r))
      .catch(() => live && setRequests([]));
    return () => {
      live = false;
    };
  }, [pathname, circleRequestsEnabled, requestsRead]);

  const current = activeTab(pathname);
  const chosen = profiles.find((p) => p.id === scanningForId(chosenProfileId, profiles));
  const scanningFor = chosen ? headerProfileName(chosen, profiles) : null;
  const context: ScanningFor = {
    chosenProfileId,
    chooseProfile: setChosenProfileId,
    requests,
    refreshRequests: () => setRequestsRead((n) => n + 1),
  };

  return (
    <div className="tab-shell">
      <ShellHeader scanningFor={scanningFor} />
      {noticesShownOn(pathname) && (
        <div className="tab-shell__notices">
          {/* One line each on Scan, so the page starts sooner; the full notices on Profile. */}
          <LandingNotices {...notices} slim={current === "scan"} />
          {current === "scan" && <RequestNotice requests={requests} />}
        </div>
      )}
      <Outlet context={context} />
      <nav className="tab-bar" aria-label="Main">
        {(["profile", "scan", "circle"] as Tab[]).map((tab) => (
          <Link
            key={tab}
            to={TAB_PATH[tab]}
            className={`tab-bar__item tab-bar__item--${tab}`}
            aria-current={current === tab ? "page" : undefined}
          >
            <span className="tab-bar__icon" aria-hidden="true">
              <TabIcon tab={tab} />
              {tab === "profile" && badge > 0 && <span className="tab-bar__badge">{badge > 99 ? "99+" : badge}</span>}
              {tab === "circle" && requests.length > 0 && (
                <span className="tab-bar__badge">{requests.length > 99 ? "99+" : requests.length}</span>
              )}
            </span>
            <span className="tab-bar__label">{TAB_LABEL[tab]}</span>
            {tab === "profile" && badge > 0 && <span className="visually-hidden">, {badgeLabel(badge)}</span>}
            {tab === "circle" && requests.length > 0 && (
              <span className="visually-hidden">, {requestBadgeLabel(requests.length)}</span>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Scan's follow-request line, in the slim notices' style, after Condition 2's lines. */
export function RequestNotice({ requests }: { requests: Pick<CircleRequest, "requester_name" | "requester_email">[] }) {
  if (requests.length === 0) return null;
  return (
    <section className="change-notice change-notice--slim" aria-labelledby="follow-request-notice-heading">
      <h2 id="follow-request-notice-heading" className="visually-hidden">
        {REQUESTS_HEADING}
      </h2>
      <p>
        {requestNoticeLine(requests)} <Link to="/circle#follow-requests">Review</Link>
      </p>
    </section>
  );
}

/** The wordmark, and the profile Scan checks for — a link to Scan. Nothing more: no allergens here,
 *  and no profile at all until there is one. `scanningFor` is its name, with how you hold it when
 *  another profile shares the name (lib/profileLineCopy.ts headerProfileName). */
export function ShellHeader({ scanningFor }: { scanningFor: string | null }) {
  return (
    <header className="shell-header">
      <span className="shell-header__wordmark">CircleBite</span>
      {scanningFor && (
        <Link to={LANDING_PATH} className="shell-header__profile">
          Scanning for: <strong>{scanningFor}</strong>
        </Link>
      )}
    </header>
  );
}

function TabIcon({ tab }: { tab: Tab }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (tab === "profile") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
      </svg>
    );
  }
  if (tab === "scan") {
    // A viewfinder around barcode bars.
    return (
      <svg {...common}>
        <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
        <path d="M8 9v6M11 9v6M14 9v6M16.5 9v6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 20c0-3 3-5 6-5s6 2 6 5M15 15.5c2.5 0 6 1.2 6 4.5" />
    </svg>
  );
}
