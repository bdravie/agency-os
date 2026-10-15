import Link from "next/link";
import { ChevronRight, Inbox } from "lucide-react";
import { stageLabel } from "@/lib/stages";

// Shared presentational pieces: page header, badges, stat tiles and empty states.

export function PageHeader({ title, description, actions, back }: {
  title: string; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string };
}) {
  return (
    <header className="page-header">
      {back && (
        <nav aria-label="Breadcrumb" className="crumbs">
          <Link href={back.href}>{back.label}</Link>
          <ChevronRight size={14} aria-hidden />
          <span aria-current="page">{title}</span>
        </nav>
      )}
      <div className="page-header-row">
        <div>
          <h1>{title}</h1>
          {description && <p className="page-desc">{description}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </header>
  );
}

const TONES: Record<string, string> = {
  New: "neutral", Draft: "neutral", Idea: "neutral", Paused: "warn",
  Contacted: "blue", Sent: "blue", Scripted: "blue",
  Replied: "violet", Interview: "violet",
  "Call booked": "warn", Filmed: "warn",
  "Proposal sent": "cyan",
  Won: "good", Client: "good", Active: "good", Accepted: "good", Posted: "good",
  Lost: "bad", Declined: "bad", Ended: "bad", "Not a fit": "bad",
};

export function Badge({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  return <span className={`badge tone-${TONES[value] ?? "neutral"}`}>{value}</span>;
}

/** A deal stage, shown with its plain-English title (the database value stays the same). */
export function StageBadge({ stage }: { stage: string | null | undefined }) {
  if (!stage) return null;
  return <span className={`badge tone-${TONES[stage] ?? "neutral"}`}>{stageLabel(stage)}</span>;
}

export function Stat({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </>
  );
  return href ? <Link href={href} className="stat card-link">{body}</Link> : <div className="stat">{body}</div>;
}

export function EmptyState({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>{icon ?? <Inbox size={22} />}</div>
      <p className="empty-title">{title}</p>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}
