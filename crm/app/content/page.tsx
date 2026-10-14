import Link from "next/link";
import { query } from "@/lib/db";
import { generateIdeasAction } from "@/lib/actions";
import ContentBoard from "@/components/ContentBoard";
import ActionForm from "@/components/ActionForm";

export const dynamic = "force-dynamic";

export default async function Content() {
  const items = await query<any>(`SELECT id, idea, format, status, keyword FROM content_items ORDER BY created_at DESC, id DESC`);
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Content</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/content/calendar">Calendar</Link>
          <Link href="/content/repurpose"><button>Repurpose a transcript</button></Link>
        </div>
      </div>
      <details className="card" style={{ marginBottom: 16 }}>
        <summary>Generate 20 video ideas</summary>
        <ActionForm action={generateIdeasAction} label="Generate ideas" busyLabel="Generating… (about 20 seconds)" style={{ marginTop: 12, maxWidth: 520 }}>
          <input name="audience" placeholder="Audience for this batch (optional), e.g. HVAC firms in the UK" />
        </ActionForm>
      </details>
      <ContentBoard initial={items} />
    </>
  );
}
