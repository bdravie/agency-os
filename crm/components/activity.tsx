import { ArrowRightLeft, Building2, Circle, FileSignature, FileText, HardDrive, Mail, MessageSquare, Phone, Search, Sparkles, UserPlus, Video } from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  email_logged: Mail, email_found: Mail, call_logged: Phone, dm_logged: MessageSquare, note_logged: MessageSquare,
  stage_changed: ArrowRightLeft, company_added: Building2, lead_added: Building2, contact_added: UserPlus,
  deal_created: ArrowRightLeft, places_lookup: Search, website_found: Search, backup_completed: HardDrive,
  proposal_drafted: FileSignature, proposal_status: FileSignature, content_ideas_generated: Video, content_repurposed: Video,
  quote_created: FileText, quote_sent: FileText, quote_accepted: FileText, quote_declined: FileText, csv_import: Building2,
};

export function ActivityIcon({ type, size = 15 }: { type: string; size?: number }) {
  const Icon = ICONS[type] ?? (type.startsWith("quote") ? FileText : type.startsWith("content") ? Sparkles : Circle);
  return <Icon size={size} />;
}

/** "email_logged" -> "Email logged" */
export const activityLabel = (type: string) => type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
