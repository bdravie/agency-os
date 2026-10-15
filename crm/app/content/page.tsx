import Link from "next/link";
import { CalendarDays, Repeat2 } from "lucide-react";
import { query } from "@/lib/db";
import { generateIdeasAction } from "@/lib/actions";
import ContentBoard from "@/components/ContentBoard";
import ActionForm from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Content" };

export default async function Content() {
  const items = await query<any>(`SELECT id, idea, format, status, keyword, scheduled_for::text AS day FROM content_items ORDER BY created_at DESC, id DESC`);
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
        <summary>Generate 20 video ideas</summary>
        <ActionForm action={generateIdeasAction} label="Generate ideas" busyLabel="Generating… (about 20 seconds)" style={{ marginTop: 12, maxWidth: 520 }}>
          <input name="audience" placeholder="Audience for this batch (optional), e.g. HVAC firms in the UK" aria-label="Audience" />
        </ActionForm>
      </details>
      <ContentBoard initial={items} />
    </>
  );
}
