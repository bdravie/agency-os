import { NAV_GROUPS, type NavItem } from "../components/nav-items.ts";

// The dashboard brain (crm/components/brain/BrainHub.tsx) shows the CRM as four lobes, one per stage of the business,
// read clockwise from the front-left: Find, Sell, Deliver, Grow. Each lobe takes one sidebar group whole, so a page
// added to that group shows up in the brain too. The other two groups are not lobes:
// - Home's daily screens (Calendar, Inbox, Tasks) and Setup sit on the brain stem, a row of small links under it.
// - The Dashboard is the page the brain is on, so it is left out.
// A test (tests/brainLobes.test.mjs) checks that every page in the sidebar is reachable from the brain exactly once.

export type LobeKey = "find" | "sell" | "deliver" | "grow";
export type Lobe = {
  key: LobeKey;
  label: string;
  group: string;            // the NAV_GROUPS title it takes its pages from
  tagline: string;          // one line in the pull-out preview
  corner: "tl" | "tr" | "br" | "bl";
  items: NavItem[];
};

const LOBES: Omit<Lobe, "items">[] = [
  { key: "find", label: "Find", group: "Find and win", tagline: "Leads, niches, companies and the pipeline", corner: "tl" },
  { key: "sell", label: "Sell", group: "Sell", tagline: "Calls, quotes, audits and objections", corner: "tr" },
  { key: "deliver", label: "Deliver", group: "Deliver", tagline: "Clients, results, training and processes", corner: "br" },
  { key: "grow", label: "Grow", group: "Grow", tagline: "Content, the funnel and the public site", corner: "bl" },
];

const STEM_GROUPS = ["Home", "Setup"];
const DASHBOARD = "/";

const groupItems = (title: string) => NAV_GROUPS.find((g) => g.title === title)?.items ?? [];

export const BRAIN_LOBES: Lobe[] = LOBES.map((l) => ({ ...l, items: groupItems(l.group) }));

/** The brain stem: Home's daily screens, then Setup, without the Dashboard itself. */
export const BRAIN_STEM: NavItem[] = STEM_GROUPS.flatMap(groupItems).filter((i) => i.href !== DASHBOARD);

/** Every page the brain links to (lobes, then stem). */
export const BRAIN_HREFS: string[] = [...BRAIN_LOBES.flatMap((l) => l.items), ...BRAIN_STEM].map((i) => i.href);
