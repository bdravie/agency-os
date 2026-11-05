import { notFound } from "next/navigation";
import ToastForm from "@/components/ToastForm";
import { query } from "@/lib/db";
import { saveContent, scheduleContent, writeScriptAction } from "@/lib/actions";
import ActionForm from "@/components/ActionForm";
import CopyButton from "@/components/CopyButton";
import { Badge, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ContentItem({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [c] = await query<any>(`SELECT *, scheduled_for::text AS day FROM content_items WHERE id = $1`, [id]);
  if (!c) notFound();
  return (
    <>
      <PageHeader
        back={{ href: "/content", label: "Content" }}
        title={c.idea}
        description={<span className="row" style={{ gap: 10 }}><Badge value={c.status} />{c.format && <span>{c.format}</span>}{c.day && <span>Scheduled {c.day}</span>}</span>}
      />
      <div className="split">
        <ToastForm action={saveContent} success="Saved" className="card stack" style={{ gap: 10 }}>
          <input type="hidden" name="id" value={id} />
          <h2>Script and caption</h2>
          <input name="idea" defaultValue={c.idea} aria-label="Idea" />
          <input name="hook" defaultValue={c.hook ?? ""} placeholder="Chosen hook" aria-label="Hook" />
          <input name="hook_alt" defaultValue={c.hook_alt ?? ""} placeholder="Alternative hook (B), optional" aria-label="Alternative hook" />
          <textarea id="script" name="script" rows={16} defaultValue={c.script ?? ""} placeholder="Write your script here, or let the AI draft it" aria-label="Script" />
          <textarea id="caption" name="caption" rows={3} defaultValue={c.caption ?? ""} placeholder="Caption" aria-label="Caption" />
          <input name="keyword" defaultValue={c.keyword ?? ""} placeholder="Comment keyword" aria-label="Keyword" />
          <div className="row"><button>Save</button><CopyButton targetId="script" /></div>
        </ToastForm>
        <div className="stack">
          <section className="card">
            <h2>Write it with AI</h2>
            <p className="muted">Writes 5 hooks, a 30–45 second script, on-screen text and a caption. It overwrites the fields on the left.</p>
            <ActionForm action={writeScriptAction} label={c.script ? "Rewrite script" : "Write script"} busyLabel="Writing… (about 15 seconds)" confirm={c.script ? "This replaces the script, hooks, caption and keyword with a new AI version. Anything you wrote yourself will be lost. Carry on?" : undefined}>
              <input type="hidden" name="id" value={id} />
            </ActionForm>
          </section>
          <section className="card">
            <h2>Schedule</h2>
            <ToastForm action={scheduleContent} success="Date saved" className="row">
              <input type="hidden" name="id" value={id} />
              <input type="date" name="date" defaultValue={c.day ?? ""} aria-label="Date" />
              <button className="secondary">{c.day ? "Reschedule" : "Schedule"}</button>
            </ToastForm>
          </section>
        </div>
      </div>
    </>
  );
}
