import { Building2, Inbox, Mail, CheckSquare, ClipboardCheck, MessageSquareWarning, GraduationCap, Radar, Phone, ShieldBan, TrendingUp, Funnel, FileSignature, FileText, CalendarDays, Kanban, LayoutDashboard, FlaskConical, Package, Users, Video, Workflow, type LucideIcon } from "lucide-react";

// One place that defines where everything lives. Grouped by what you are doing (BRAND_SHEET.md section 6).
export type NavItem = { href: string; label: string; icon: LucideIcon; hint: string };
export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Home", items: [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, hint: "Today, this week and this month at a glance" },
    { href: "/calendar", label: "Calendar", icon: CalendarDays, hint: "Your week, and book a meeting with a Meet link" },
    { href: "/inbox", label: "Inbox", icon: Inbox, hint: "Replies to the emails you sent" },
    { href: "/tasks", label: "Tasks", icon: CheckSquare, hint: "Everything to do" },
  ] },
  { title: "Find and win", items: [
    { href: "/sourcer", label: "Lead Sourcer", icon: Radar, hint: "Search every source, filter, add and enrich" },
    { href: "/companies", label: "Companies", icon: Building2, hint: "Leads and clients" },
    { href: "/deals", label: "Deals", icon: Kanban, hint: "Board by stage" },
    { href: "/proposals", label: "Proposals", icon: FileSignature, hint: "Upwork proposals" },
  ] },
  { title: "Sell", items: [
    { href: "/calls", label: "Calls", icon: Phone, hint: "Transcripts, pains and next steps" },
    { href: "/quotes", label: "Quotes", icon: FileText, hint: "Prices sent to clients" },
    { href: "/audits", label: "Audits", icon: ClipboardCheck, hint: "Task audits and reports" },
    { href: "/objections", label: "Objections", icon: MessageSquareWarning, hint: "Objection library and best responses" },
  ] },
  { title: "Deliver", items: [
    { href: "/clients", label: "Clients", icon: Users, hint: "Revenue and reviews" },
    { href: "/outcomes", label: "Outcomes", icon: TrendingUp, hint: "Before-and-after results per client" },
    { href: "/enablement", label: "Enablement", icon: GraduationCap, hint: "Client training, sessions and files" },
    { href: "/flowcharts", label: "Flowcharts", icon: Workflow, hint: "Map a process as a diagram and export it" },
  ] },
  { title: "Grow", items: [
    { href: "/content", label: "Content", icon: Video, hint: "Ideas, scripts, calendar" },
    { href: "/funnel", label: "Funnel", icon: Funnel, hint: "Conversion, lost reasons and channels" },
    { href: "/site-tests", label: "Site tests", icon: FlaskConical, hint: "Which version of clrsweb.uk books more calls" },
  ] },
  { title: "Setup", items: [
    { href: "/offers", label: "Offers", icon: Package, hint: "Your catalogue and prices" },
    { href: "/mailboxes", label: "Mailboxes", icon: Mail, hint: "Connect Google mailboxes to send from" },
    { href: "/suppression", label: "Suppression", icon: ShieldBan, hint: "Never-contact list" },
  ] },
];
export const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
