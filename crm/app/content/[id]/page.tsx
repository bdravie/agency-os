import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { saveContent, scheduleContent, writeScriptAction } from "@/lib/actions";
import ActionForm from "@/components/ActionForm";
import CopyButton from "@/components/CopyButton";

export const dynamic = "force-dynamic";

export default async function ContentItem({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [c] = await query<any>(`SELECT *, scheduled_for::text AS day FROM content_items WHERE id = $1`, [id]);
  if (!c) notFound();
  return (
    <>
      <p><Link href="/content">← Content</Link></p>
      <h1>{c.idea}</h1>
      <p className="muted">{c.status}{c.format && ` · ${c.format}`}</p>
      <div className="grid">
        <section className="card">
          <h2>AI script</h2>
          <p className="muted">Writes 5 hooks, a 30–45 second script, on-screen text and a caption. Overwrites the fields on the right.</p>
          <ActionForm action={writeScriptAction} label={c.script ? "Rewrite script" : "Write script"} busyLabel="Writing… (about 15 seconds)">
            <input type="hidden" name="id" value={id} />
          </ActionForm>
          <h2 style={{ marginTop: 16 }}>Schedule</h2>
          <form action={scheduleContent} style={{ display: "flex", gap: 8 }}>
            <input type="hidden" name="id" value={id} />
            <input type="date" name="date" defaultValue={c.day ?? ""} />
            <button>{c.day ? "Reschedule" : "Schedule"}</button>
          </form>
        </section>
        <form action={saveContent} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input type="hidden" name="id" value={id} />
          <h2>Edit</h2>
          <input name="idea" defaultValue={c.idea} />
          <input name="hook" defaultValue={c.hook ?? ""} placeholder="Chosen hook" />
          <textarea id="script" name="script" rows={14} defaultValue={c.script ?? ""} placeholder="Script" />
          <textarea id="caption" name="caption" rows={3} defaultValue={c.caption ?? ""} placeholder="Caption" />
          <input name="keyword" defaultValue={c.keyword ?? ""} placeholder="Comment keyword" />
          <div style={{ display: "flex", gap: 8 }}><button>Save</button><CopyButton targetId="script" /></div>
        </form>
      </div>
    </>
  );
}
