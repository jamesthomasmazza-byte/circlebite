import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { LandingNotices, type NoticeData } from "./LandingNotices";
import { getUnseenChanges, listProfiles } from "./lib/api";
import { activeTab, badgeLabel, noticesShownOn, profileBadgeCount, TAB_LABEL, TAB_PATH, type Tab } from "./lib/tabs";

const EMPTY: NoticeData = { unseen: [], unseenFailed: false, needsReview: [] };

/**
 * Every signed-in page sits in this (main.tsx): the page, then the bottom tab bar — Profile · Scan ·
 * Circle (2026-10-23). Sign-in lands on Scan (lib/tabs.ts LANDING_PATH), which skips the old
 * dashboard, so its two notices live here: above Scan and the Profile tab's own page, and as a count
 * on the Profile tab everywhere. Re-read on every navigation, so acknowledging changes on a profile
 * page clears the badge by the time you're back.
 */
export function TabShell() {
  const { pathname } = useLocation();
  const [notices, setNotices] = useState<NoticeData>(EMPTY);
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.allSettled([getUnseenChanges(), listProfiles()]).then(([unseen, profiles]) => {
      if (!live) return;
      const unseenRows = unseen.status === "fulfilled" ? unseen.value : [];
      const managed = profiles.status === "fulfilled" ? profiles.value.managed : [];
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

  const current = activeTab(pathname);

  return (
    <div className="tab-shell">
      {noticesShownOn(pathname) && (
        <div className="tab-shell__notices">
          <LandingNotices {...notices} />
        </div>
      )}
      <Outlet />
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
            </span>
            <span className="tab-bar__label">{TAB_LABEL[tab]}</span>
            {tab === "profile" && badge > 0 && <span className="visually-hidden">, {badgeLabel(badge)}</span>}
          </Link>
        ))}
      </nav>
    </div>
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
