import { notFound } from "next/navigation";
import ToastForm from "@/components/ToastForm";
import { query } from "@/lib/db";
import { saveContent, scheduleContent } from "@/lib/actions";
import WriteScriptButton from "@/components/WriteScriptButton";
import CopyButton from "@/components/CopyButton";
import ProjectChecklist from "@/components/ProjectChecklist";
import { DEFAULT_CHECKLIST } from "@/lib/quickCaptureMath";
import { Badge, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ContentItem({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [[c], [project]] = await Promise.all([
    query<any>(`SELECT *, scheduled_for::text AS day FROM content_items WHERE id = $1`, [id]),
    query<any>(`SELECT * FROM content_projects WHERE content_item_id = $1`, [id]),
  ]);
  if (!c) notFound();
  return (
    <>
      <PageHeader
        back={{ href: "/content", label: "Content" }}
        title={c.idea}
        description={
          <span className="row" style={{ gap: 10 }}>
            <Badge value={c.status} />
            {c.niche && <Badge value={c.niche} />}
            {c.pillar && <span>{c.pillar}</span>}
            {c.format && <span>{c.format}</span>}
            {c.day && <span>Scheduled {c.day}</span>}
          </span>
        }
      />
      <div className="split">
        <ToastForm
          key={`${c.id}:${c.hook ?? ""}:${c.script ?? ""}:${c.caption ?? ""}`}
          action={saveContent}
          success="Saved"
          className="card stack"
          style={{ gap: 10 }}
        >
          <input type="hidden" name="id" value={id} />
          <h2>Script and caption</h2>
          <input name="idea" defaultValue={c.idea} aria-label="Idea" />
          <input name="hook" defaultValue={c.hook ?? ""} placeholder="Chosen hook" aria-label="Hook" />
          <input name="hook_alt" defaultValue={c.hook_alt ?? ""} placeholder="Alternative hook (B), optional" aria-label="Alternative hook" />
          <textarea
            key={c.script ?? "empty"}
            id="script"
            name="script"
            rows={16}
            defaultValue={c.script ?? ""}
            placeholder="Write your script here, or let the AI draft it"
            aria-label="Script"
          />
          <span className="muted" style={{ display: "block", fontSize: 12, marginTop: -4 }}>
            Tip: Put rough notes, thoughts, or transcripts here, then click &ldquo;Rewrite script&rdquo; to polish into a spoken script.
          </span>
          <textarea id="caption" name="caption" rows={3} defaultValue={c.caption ?? ""} placeholder="Caption" aria-label="Caption" />
          <input name="keyword" defaultValue={c.keyword ?? ""} placeholder="Comment keyword" aria-label="Keyword" />
          <div className="row"><button>Save</button><CopyButton targetId="script" /></div>
        </ToastForm>
        <div className="stack" style={{ gap: 14 }}>
          <ProjectChecklist contentItemId={id} checklist={project?.checklist || DEFAULT_CHECKLIST} />

          {(project?.raw_notes || c.notes) && (
            <section className="card" style={{ background: "var(--surface)" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14.5 }}>Captured notes</h3>
              <p style={{ margin: 0, fontSize: 13, whiteSpace: "pre-wrap", color: "var(--fg)", lineHeight: 1.5 }}>
                {project?.raw_notes || c.notes}
              </p>
              {project?.talking_points && Array.isArray(project.talking_points) && project.talking_points.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <b style={{ fontSize: 12.5 }} className="muted">Key talking points:</b>
                  <ul className="fx-bullets" style={{ margin: "6px 0 0", paddingLeft: 16 }}>
                    {project.talking_points.map((pt: string, idx: number) => (
                      <li key={idx} style={{ fontSize: 13 }}>{pt}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section className="card">
            <h2>Write it with AI</h2>
            <p className="muted">
              Polishes your notes into 5 hook options, a 30–45s spoken script, on-screen text, caption and keyword.
            </p>
            <WriteScriptButton
              id={id}
              hasScript={Boolean(c.script)}
              hasRawNotes={Boolean(project?.raw_notes || c.notes)}
            />
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
