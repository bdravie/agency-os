"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { jumpTo, tabForSection } from "@/lib/jump";

// The pill menu bar that switches between the sections of one screen (BRAND_SHEET.md section 6). Each tab is a link with its own
// address, so a section can be bookmarked and the back button works. A count is what is in that section; `hot` marks one that needs you.
// Secondary links (such as Archived, Deleted, Proof and answers) sit in a matching pill bar on the right when `right` is passed.
export type SectionTab = { key: string; label: string; href: string; count?: number; hot?: boolean };

const renderBar = (list: SectionTab[], current: string) => (
  <div className="tabs-bar">
    {list.map((t) => (
      <Link key={t.key} href={t.href} scroll={false} aria-current={t.key === current ? "page" : undefined}>
        {t.label}
        {t.count !== undefined && t.count > 0 && <span className={`tabs-count${t.hot ? " hot" : ""}`}>{t.count}</span>}
      </Link>
    ))}
  </div>
);

export default function SectionTabs({ label, tabs, right, current }: { label: string; tabs: SectionTab[]; right?: SectionTab[]; current: string }) {
  const router = useRouter();
  useEffect(() => {
    const syncHash = () => {
      const id = window.location.hash.slice(1);
      if (!id) return;
      if (jumpTo(id)) return;
      const tab = tabForSection(window.location.pathname, id);
      if (tab && tab !== current) router.replace(`${window.location.pathname}?tab=${tab}#${id}`, { scroll: false });
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [current, router]);

  /** Left and right arrows move between the tabs, Home and End jump to the ends. Enter opens one, as for any link. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const links = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>("a"));
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    const to = e.key === "ArrowRight" ? at + 1 : e.key === "ArrowLeft" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? links.length - 1 : -2;
    if (at < 0 || to === -2) return;
    e.preventDefault();
    links[(to + links.length) % links.length]?.focus();
  };
  return (
    <nav className="tabs" aria-label={label} onKeyDown={onKeyDown}>
      {renderBar(tabs, current)}
      {right && right.length > 0 && renderBar(right, current)}
    </nav>
  );
}
