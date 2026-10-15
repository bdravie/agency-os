import { Building2, CheckSquare, ClipboardCheck, MessageSquareWarning, GraduationCap, Phone, TrendingUp, Compass, Funnel, FileSignature, FileText, Kanban, Package, Sun, Users, Video, type LucideIcon } from "lucide-react";

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
    { href: "/funnel", label: "Funnel", icon: Funnel, hint: "Conversion, lost reasons and channels" },
  ] },
  { title: "Selling", items: [
    { href: "/calls", label: "Calls", icon: Phone, hint: "Transcripts, pains and next steps" },
    { href: "/objections", label: "Objections", icon: MessageSquareWarning, hint: "Objection library and best responses" },
    { href: "/audits", label: "Audits", icon: ClipboardCheck, hint: "Task audits and reports" },
    { href: "/quotes", label: "Quotes", icon: FileText, hint: "Prices sent to clients" },
    { href: "/outcomes", label: "Outcomes", icon: TrendingUp, hint: "Before-and-after results per client" },
    { href: "/enablement", label: "Enablement", icon: GraduationCap, hint: "Client training, sessions and files" },
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
