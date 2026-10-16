import Link from "next/link";
import { MessageSquareWarning } from "lucide-react";
import { query } from "@/lib/db";
import { addObjection, mergeObjection, saveObjection } from "@/lib/callActions";
import { dateOnly } from "@/lib/format";
import ToastForm from "@/components/ToastForm";
import { EmptyState, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Objection Library" };

export default async function Objections() {
  const [rows, quotes] = await Promise.all([
    query<any>(
      `SELECT o.id, o.name, o.best_response, count(x.id) AS times, max(c.occurred_at) AS last_seen,
              count(DISTINCT d.id) FILTER (WHERE d.stage = 'Won') AS won, count(DISTINCT d.id) FILTER (WHERE d.stage = 'Lost') AS lost
         FROM objections o LEFT JOIN call_objections x ON x.objection_id = o.id LEFT JOIN calls c ON c.id = x.call_id LEFT JOIN deals d ON d.id = c.deal_id
        GROUP BY o.id ORDER BY count(x.id) DESC, lower(o.name)`),
    query<any>(`SELECT x.objection_id, x.quote, c.id AS call_id, c.title, c.occurred_at FROM call_objections x JOIN calls c ON c.id = x.call_id WHERE x.quote IS NOT NULL ORDER BY c.occurred_at DESC LIMIT 400`),
  ]);
  const byObjection = new Map<number, any[]>();
  for (const q of quotes) byObjection.set(q.objection_id, [...(byObjection.get(q.objection_id) ?? []), q]);
  const total = rows.reduce((s: number, r: any) => s + Number(r.times), 0);
  const withResponse = rows.filter((r: any) => r.best_response).length;

  return (
    <>
      <PageHeader title="Objection Library" description="Every objection raised across your calls, how often, and your best response to each. The response shows up on any call where the objection comes up again." />
      <section className="stats">
        <Stat label="Objections tracked" value={rows.length} />
        <Stat label="Times raised" value={total} hint="across all analysed calls" />
        <Stat label="With a best response" value={`${withResponse} of ${rows.length}`} hint={rows.length - withResponse ? `${rows.length - withResponse} still need one` : "all covered"} />
      </section>

      <details className="card" style={{ marginBottom: 16 }}>
        <summary>Add an objection by hand</summary>
        <ToastForm action={addObjection} success="Objection added" reset className="stack" style={{ gap: 8, marginTop: 12 }}>
          <input name="name" placeholder="Short name, e.g. “Price too high”" aria-label="Objection name" maxLength={80} required />
          <textarea name="best_response" rows={3} placeholder="Your best response (optional)" aria-label="Best response" />
          <button className="secondary" style={{ alignSelf: "flex-start" }}>Add</button>
        </ToastForm>
      </details>

      {rows.length === 0 ? (
        <div className="card"><EmptyState title="No objections yet" icon={<MessageSquareWarning size={22} />}>They appear here as you analyse calls. <Link href="/calls/new">Log a call</Link> to start.</EmptyState></div>
      ) : (
        <div className="stack">
          {rows.map((o: any) => (
            <section key={o.id} id={`o${o.id}`} className="card">
              <ToastForm key={`${o.name}:${o.best_response}`} action={saveObjection} success="Saved" className="stack" style={{ gap: 10 }}>
                <input type="hidden" name="id" value={o.id} />
                <div className="row-between">
                  <input name="name" defaultValue={o.name} aria-label="Objection name" style={{ fontWeight: 650, fontSize: 16, flex: 1, minWidth: 200 }} maxLength={80} />
                  <span className="row" style={{ gap: 10 }}>
                    <span className="badge tone-blue">{Number(o.times)} call{Number(o.times) === 1 ? "" : "s"}</span>
                    <span className="muted">{o.last_seen ? `last ${dateOnly(o.last_seen)}` : "not raised yet"}</span>
                    {(Number(o.won) > 0 || Number(o.lost) > 0) && <span className="muted">deals: {o.won} won · {o.lost} lost</span>}
                  </span>
                </div>
                <label className="stack" style={{ gap: 4 }}>
                  <span className="field-label">Your best response</span>
                  <textarea name="best_response" rows={3} defaultValue={o.best_response ?? ""} placeholder="What works when someone says this? Write it the way you'd say it." />
                </label>
                <button className="secondary" style={{ alignSelf: "flex-start" }}>Save</button>
              </ToastForm>

              {(byObjection.get(o.id) ?? []).length > 0 && (
                <details style={{ marginTop: 10 }}>
                  <summary>How it was said ({(byObjection.get(o.id) ?? []).length})</summary>
                  <ul style={{ marginTop: 6 }}>{(byObjection.get(o.id) ?? []).slice(0, 8).map((q, i) => (
                    <li key={i}>&ldquo;{q.quote}&rdquo; <span className="muted">· <Link href={`/calls/${q.call_id}`}>{q.title}</Link>, {dateOnly(q.occurred_at)}</span></li>
                  ))}</ul>
                </details>
              )}

              {rows.length > 1 && (
                <ToastForm action={mergeObjection} success="Merged" confirm={`Merge "${o.name}" into the one you chose? Its mentions move across and this entry is removed.`} className="row" style={{ marginTop: 10 }}>
                  <input type="hidden" name="from_id" value={o.id} />
                  <select name="into_id" defaultValue="" aria-label={`Merge ${o.name} into`}>
                    <option value="" disabled>Merge into…</option>
                    {rows.filter((r: any) => r.id !== o.id).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <button className="link">Merge duplicates</button>
                </ToastForm>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
