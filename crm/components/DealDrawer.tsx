"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Plus, X } from "lucide-react";
import { addDealTask, completeTask, logDealNote } from "@/lib/actions";
import { gbp } from "@/lib/quote";
import { ago } from "@/lib/format";
import { STAGE_META, stageLabel, type Stage } from "@/lib/stages";
import { ActivityIcon, activityLabel } from "./activity";
import DealStageBar from "./DealStageBar";
import ToastForm from "./ToastForm";
import { Badge } from "./ui";

type Data = {
  deal: { id: number; title: string; stage: string; setup: number; monthly: number; source: string | null; expected_close: string | null; lost_reason: string | null; created_at: string; updated_at: string; company_id: number | null; company_name: string | null; domain: string | null; generic_email: string | null; company_status: string | null };
  tasks: { id: number; title: string; due_at: string | null }[];
  quotes: { id: number; status: string; setup: number; monthly: number; created_at: string }[];
  activity: { id: number; type: string; body: string | null; occurred_at: string }[];
  contact: { name: string; role: string | null; email: string | null; phone: string | null } | null;
};

// Quick view: the essentials of a deal without leaving the board. "Open full page" goes to /deals/[id] in a new tab.
export default function DealDrawer({ dealId, stage, onMove, onClose }: { dealId: number; stage?: string; onMove: (id: number, stage: string) => void; onClose: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);

  const load = useCallback(() => {
    fetch(`/api/deals/${dealId}`).then(async (r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load this deal."))))
      .then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message));
  }, [dealId]);

  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => { panel.current?.focus(); }, [dealId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const d = data?.deal;
  const current = (stage ?? d?.stage ?? "New") as Stage;
  const meta = STAGE_META[current];

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} aria-hidden />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={d ? `Deal: ${d.title}` : "Deal"} tabIndex={-1} ref={panel}>
        <header className="drawer-head">
          <div style={{ minWidth: 0 }}>
            <div className="muted">{d?.company_id ? <Link href={`/companies/${d.company_id}`}>{d.company_name}</Link> : "Deal"}</div>
            <h2 className="drawer-title">{d?.title ?? "Loading…"}</h2>
          </div>
          <div className="row" style={{ gap: 4, flex: "none" }}>
            <a href={`/deals/${dealId}`} target="_blank" rel="noreferrer" className="btn secondary" title="Open the full page in a new tab"><ExternalLink size={15} aria-hidden /> Open full page</a>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </header>

        {error && <p className="error" style={{ padding: 20 }}>{error}</p>}
        {!d && !error && <p className="muted" style={{ padding: 20 }}>Loading…</p>}

        {d && data && (
          <div className="drawer-body">
            <section>
              <div className="field-label">Stage</div>
              <DealStageBar stage={current} onPick={(s) => onMove(dealId, s)} />
              <div className="next" style={{ marginTop: 12 }}>
                <div><div className="next-label">{meta.label}: {meta.hint}</div><b style={{ fontWeight: 550 }}>{meta.next}</b></div>
              </div>
              {current === "Lost" && d.lost_reason && <p className="muted" style={{ marginTop: 8 }}>Reason: {d.lost_reason}</p>}
            </section>

            <section className="kv">
              <div><div className="field-label">Setup</div><div className="kv-value">{gbp(d.setup)}</div></div>
              <div><div className="field-label">Monthly</div><div className="kv-value">{gbp(d.monthly)}</div></div>
              <div><div className="field-label">Expected close</div><div className="kv-value small">{d.expected_close ?? "Not set"}</div></div>
              <div><div className="field-label">Last change</div><div className="kv-value small">{ago(d.updated_at)}</div></div>
            </section>

            {data.contact && (
              <section><div className="field-label">Contact</div><div><b>{data.contact.name}</b> <span className="muted">{[data.contact.role, data.contact.email, data.contact.phone].filter(Boolean).join(" · ")}</span></div></section>
            )}

            <section>
              <div className="row-between"><div className="field-label">Tasks</div></div>
              {data.tasks.length === 0 && <p className="muted">No open tasks.</p>}
              <ul>{data.tasks.map((t) => (
                <li key={t.id} className="row">
                  <ToastForm action={completeTask} success="Task done" onDone={load}>
                    <input type="hidden" name="task_id" value={t.id} />
                    <button className="link" aria-label={`Mark done: ${t.title}`}><Check size={16} /></button>
                  </ToastForm>
                  <span style={{ flex: 1 }}>{t.title}</span>
                  {t.due_at && <span className="muted">{new Date(t.due_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
                </li>
              ))}</ul>
              <ToastForm action={addDealTask} success="Task added" reset onDone={load} className="row" style={{ marginTop: 8 }}>
                <input type="hidden" name="deal_id" value={dealId} />
                <input name="title" placeholder="Add a task…" aria-label="New task" required style={{ flex: 1, minWidth: 120 }} />
                <input name="due" type="date" aria-label="Due" />
                <button className="secondary" aria-label="Add task"><Plus size={15} /></button>
              </ToastForm>
            </section>

            <section>
              <div className="field-label">Quick note</div>
              <ToastForm action={logDealNote} success="Note saved" reset onDone={load} className="row">
                <input type="hidden" name="deal_id" value={dealId} />
                <input name="body" placeholder="What happened? (saved to the activity log)" aria-label="Note" style={{ flex: 1 }} required />
                <button className="secondary">Save</button>
              </ToastForm>
            </section>

            <section>
              <div className="row-between"><div className="field-label">Quotes</div><Link href={`/quotes/new?deal=${dealId}`} className="muted">Create quote</Link></div>
              {data.quotes.length === 0 ? <p className="muted">No quotes yet.</p> : (
                <ul>{data.quotes.map((q) => (
                  <li key={q.id} className="row-between"><Link href={`/quotes/${q.id}`}>Quote #{q.id}</Link><span className="row"><span className="muted">{gbp(q.setup)} + {gbp(q.monthly)}/mo</span><Badge value={q.status} /></span></li>
                ))}</ul>
              )}
            </section>

            <section>
              <div className="field-label">Recent activity</div>
              {data.activity.length === 0 ? <p className="muted">Nothing yet.</p> : (
                <ul className="timeline">{data.activity.map((a) => (
                  <li key={a.id}><span className="tl-dot"><ActivityIcon type={a.type} /></span>
                    <div><div className="tl-title">{activityLabel(a.type)}</div>{a.body && <div className="muted">{a.body}</div>}<div className="tl-time">{ago(a.occurred_at)}</div></div></li>
                ))}</ul>
              )}
            </section>

            <p className="muted" style={{ paddingBottom: 8 }}>Created {ago(d.created_at)} · now in <b>{stageLabel(current)}</b></p>
          </div>
        )}
      </aside>
    </>
  );
}
