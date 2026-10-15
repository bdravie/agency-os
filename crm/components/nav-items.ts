import { Building2, CheckSquare, Compass, FileSignature, FileText, Kanban, Package, Sun, Users, Video, type LucideIcon } from "lucide-react";

// One place that defines where everything lives. Grouped by what you are doing.
export type NavItem = { href: string; label: string; icon: LucideIcon; hint: string };
export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Work", items: [
    { href: "/", label: "Today", icon: Sun, hint: "What needs doing now" },
    { href: "/tasks", label: "Tasks", icon: CheckSquare, hint: "Everything to do" },
  ] },
  { title: "Pipeline", items: [
    { href: "/companies", label: "Companies", icon: Building2, hint: "Leads and clients" },
    { href: "/research", label: "Find contacts", icon: Compass, hint: "Companies that need a way to reach them" },
    { href: "/deals", label: "Deals", icon: Kanban, hint: "Board by stage" },
    { href: "/quotes", label: "Quotes", icon: FileText, hint: "Prices sent to clients" },
    { href: "/clients", label: "Clients", icon: Users, hint: "Revenue and reviews" },
  ] },
  { title: "Marketing", items: [
    { href: "/proposals", label: "Proposals", icon: FileSignature, hint: "Upwork proposals" },
    { href: "/content", label: "Content", icon: Video, hint: "Ideas, scripts, calendar" },
  ] },
  { title: "Setup", items: [
    { href: "/offers", label: "Offers", icon: Package, hint: "Your catalogue and prices" },
  ] },
];
export const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
