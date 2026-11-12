import { ArrowRightLeft, Building2, CalendarDays, Circle, Package, ShieldAlert, ShieldCheck, UserCheck, FileSignature, FileText, HardDrive, Mail, MessageSquare, Phone, Search, Sparkles, UserPlus, Video } from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  email_logged: Mail, email_found: Mail, call_logged: Phone, dm_logged: MessageSquare, note_logged: MessageSquare,
  stage_changed: ArrowRightLeft, company_added: Building2, lead_added: Building2, contact_added: UserPlus,
  deal_created: ArrowRightLeft, places_lookup: Search, website_found: Search, backup_completed: HardDrive,
  proposal_drafted: FileSignature, proposal_status: FileSignature, proposal_archived: FileSignature, proposal_restored: FileSignature, proposal_deleted: FileSignature, proposal_edited: FileSignature, proposal_fit: FileSignature, proposal_plan: FileSignature, proposal_improve: FileSignature, proposal_demo_brief: FileSignature, content_ideas_generated: Video, content_archived: Video, content_posted: Video, content_brief: Video, creator_added: Video, creator_checked: Video, content_insights: Video, content_keyword_reply: Video, content_metrics: Video, content_deleted: Video, content_repurposed: Video,
  deal_offer_added: Package, client_created: UserCheck, ch_health_run: ShieldCheck, gate_bypassed: ShieldAlert, gate_bypass_removed: ShieldCheck, site_checked: Search, contact_details_updated: Building2, content_idea_added: Video,
  meeting_booked: CalendarDays, meeting_cancelled: CalendarDays,
  quote_created: FileText, quote_sent: FileText, quote_accepted: FileText, quote_declined: FileText, csv_import: Building2,
};

export function ActivityIcon({ type, size = 15 }: { type: string; size?: number }) {
  const Icon = ICONS[type] ?? (type.startsWith("quote") ? FileText : type.startsWith("content") ? Sparkles : Circle);
  return <Icon size={size} />;
}

/** "email_logged" -> "Email logged" */
const LABELS: Record<string, string> = { meeting_booked: "Meeting booked", meeting_cancelled: "Meeting cancelled", ch_health_run: "Companies House check", gate_bypassed: "Verification bypassed", gate_bypass_removed: "Bypass removed", dm_logged: "Social message sent", email_logged: "Email logged", deal_offer_added: "Offer added to deal", email_reply: "Email reply received", client_created: "Client created", places_lookup: "Google lookup", search_lookup: "Web search" };
export const activityLabel = (type: string) => LABELS[type] ?? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
