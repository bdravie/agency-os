import Link from "next/link";
import { CalendarDays, Repeat2 } from "lucide-react";
import { query } from "@/lib/db";
import { generateIdeasAction } from "@/lib/actions";
import { loadContentConfig } from "@/lib/content";
import { audienceText, backlogState } from "@/lib/contentConfigMath";
import ContentBoard from "@/components/ContentBoard";
import ActionForm from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Content" };

export default async function Content({ searchParams }: { searchParams: Promise<{ more?: string }> }) {
  const override = (await searchParams).more === "1";
  const [items, config] = await Promise.all([
    query<any>(`SELECT id, idea, format, status, keyword, scheduled_for::text AS day FROM content_items ORDER BY created_at DESC, id DESC`),
    loadContentConfig(),
  ]);
  const open = items.filter((i: any) => i.status === "Idea").length;
  const gate = backlogState(open, config.max_open_ideas, override);
  return (
    <>
      <PageHeader
        title="Content"
        description="Ideas become scripts, then get filmed and posted. Click a card for details, or drag it to another stage."
        actions={
          <>
            <Link href="/content/calendar" className="btn secondary"><CalendarDays size={16} aria-hidden /> Calendar</Link>
            <Link href="/content/repurpose" className="btn secondary"><Repeat2 size={16} aria-hidden /> Repurpose a transcript</Link>
          </>
        }
      />
      <details className="card" style={{ marginBottom: 16 }}>
        <summary>Generate 20 video ideas{gate.blocked && <span className="muted"> · paused, {open} waiting</span>}</summary>
        <p className="muted" style={{ marginTop: 12 }}>Ideas are written for {audienceText(config)}. Change who they are for in <code>content:</code> in config/niches.yaml.</p>
        {gate.blocked ? (
          <p role="status" style={{ marginTop: 8 }}>
            {gate.message} <Link href="/content?more=1">Generate anyway</Link>
          </p>
        ) : (
          <ActionForm action={generateIdeasAction} label="Generate ideas" busyLabel="Generating… (about 20 seconds)" style={{ marginTop: 12, maxWidth: 520 }}>
            {override && <input type="hidden" name="override" value="1" />}
            <input name="audience" placeholder="Audience for this batch (optional), e.g. clinics only, or roofers" aria-label="Audience" />
          </ActionForm>
        )}
      </details>
      <ContentBoard initial={items} />
    </>
  );
}
