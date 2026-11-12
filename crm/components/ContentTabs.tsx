"use client";

import SectionTabs, { type SectionTab } from "./SectionTabs";

export const CONTENT_TABS: SectionTab[] = [
  { key: "overview", label: "Overview", href: "/content" },
  { key: "board", label: "Board", href: "/content?tab=board" },
  { key: "projects", label: "Projects", href: "/content?tab=projects" },
  { key: "linkedin", label: "LinkedIn", href: "/content?tab=linkedin" },
  { key: "calendar", label: "Calendar", href: "/content/calendar" },
  { key: "analytics", label: "Analytics", href: "/content/insights" },
  { key: "research", label: "Research", href: "/content/creators" },
  { key: "brief", label: "Brief", href: "/content/brief" },
];

export const CONTENT_RIGHT: SectionTab[] = [
  { key: "followers", label: "Followers", href: "/content?tab=followers" },
  { key: "footage", label: "Footage", href: "/content?tab=footage" },
  { key: "thumbnails", label: "Thumbnails", href: "/content?tab=thumbnails" },
];

export default function ContentTabs({ current, boardCount, projectCount }: { current: string; boardCount?: number; projectCount?: number }) {
  const tabs = CONTENT_TABS.map((t) => {
    if (t.key === "board" && boardCount !== undefined) return { ...t, count: boardCount };
    if (t.key === "projects" && projectCount !== undefined) return { ...t, count: projectCount };
    return t;
  });
  return <SectionTabs label="Content dashboard" current={current} tabs={tabs} right={CONTENT_RIGHT} />;
}
