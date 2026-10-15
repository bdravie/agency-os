"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Clock, ExternalLink, Plus, Search } from "lucide-react";
import { moveDeal } from "@/lib/actions";
import { STAGE_META, stageLabel, type Stage } from "@/lib/stages";
import { useToast } from "./Toast";
import DealDrawer from "./DealDrawer";
import LostDialog from "./LostDialog";
import NewDealDialog from "./NewDealDialog";

export type Deal = { id: number; title: string; stage: string; company_id: number | null; company_name: string | null; setup: number; monthly: number; updated: string };

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const CLOSED = ["Won", "Lost"];
const daysIn = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export default function Board({ initial, stages }: { initial: Deal[]; stages: readonly string[] }) {
  const toast = useToast();
  const router = useRouter();
  const [deals, setDeals] = useState(initial);
  const [over, setOver] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [lost, setLost] = useState<Deal | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");
  const [, start] = useTransition();

  useEffect(() => setDeals(initial), [initial]);
  useEffect(() => { try { setShowClosed(localStorage.getItem("deals.showClosed") === "1"); } catch {} }, []);
  const toggleClosed = () => { const v = !showClosed; setShowClosed(v); try { localStorage.setItem("deals.showClosed", v ? "1" : "0"); } catch {} };

  const visible = showClosed ? stages : stages.filter((s) => !CLOSED.includes(s));
  const closedCount = deals.filter((d) => CLOSED.includes(d.stage)).length;
  const needle = filter.trim().toLowerCase();
  const matches = useMemo(() => (d: Deal) => !needle || `${d.title} ${d.company_name ?? ""}`.toLowerCase().includes(needle), [needle]);

  function move(id: number, stage: string, reason?: string) {
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.stage === stage) return;
    if (stage === "Lost" && reason === undefined) { setLost(deal); return; } // ask why first
    const before = deals;
    setDeals(deals.map((d) => (d.id === id ? { ...d, stage, updated: new Date().toISOString() } : d))); // optimistic
    start(async () => {
      try { await moveDeal(id, stage, reason || undefined); toast(`${deal.company_name ?? deal.title.split(":")[0]} → ${stageLabel(stage)}`); }
      catch (err) { setDeals(before); toast(`Could not move the deal: ${err instanceof Error ? err.message : err}`, "bad"); }
    });
  }

  return (
    <>
      <div className="board-toolbar">
        <div className="search-field">
          <Search size={15} aria-hidden />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter deals…" aria-label="Filter deals" />
        </div>
        <div className="row">
          <button type="button" className="secondary" onClick={toggleClosed} aria-pressed={showClosed}>{showClosed ? "Hide won and lost" : `Show won and lost (${closedCount})`}</button>
          <button type="button" onClick={() => setCreating(true)}><Plus size={16} aria-hidden /> New deal</button>
        </div>
      </div>

      <div className="board" style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(200px, 1fr))` }}>
        {visible.map((stage) => {
          const meta = STAGE_META[stage as Stage];
          const col = deals.filter((d) => d.stage === stage && matches(d));
          const idx = stages.indexOf(stage);
          return (
            <section
              key={stage} aria-label={`${meta.label}, ${col.length} deals`}
              className={`col${over === stage ? " over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOver(stage); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); move(Number(e.dataTransfer.getData("text/plain")), stage); }}
            >
              <header className="col-head">
                <h2><span className="row" style={{ gap: 8 }}><i className="dot" style={{ background: meta.colour }} aria-hidden />{meta.label}</span><span className="count">{col.length}</span></h2>
                <p className="col-hint">{meta.hint}</p>
                <p className="col-total">{col.length ? `${gbp(col.reduce((s, d) => s + d.setup, 0))} setup · ${gbp(col.reduce((s, d) => s + d.monthly, 0))}/mo` : "—"}</p>
              </header>

              {col.length === 0 && <div className="drop-hint">{needle ? "No matches" : "Drop a deal here"}</div>}
              {col.map((d) => {
                const age = daysIn(d.updated);
                const quiet = !CLOSED.includes(stage) && age >= 7;
                return (
                  <article
                    key={d.id} className={`deal${openId === d.id ? " active" : ""}`} draggable tabIndex={0} role="button"
                    aria-label={`${d.title}. ${gbp(d.setup)} setup, ${gbp(d.monthly)} a month. Press Enter to open.`}
                    onClick={() => setOpenId(d.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(d.id); } }}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", String(d.id))}
                  >
                    <div className="deal-top">
                      <b>{d.title}</b>
                    </div>
                    {d.company_id && !d.title.startsWith(d.company_name ?? "\u0000") && <Link href={`/companies/${d.company_id}`} className="muted" onClick={(e) => e.stopPropagation()}>{d.company_name}</Link>}
                    <div className="deal-value">{gbp(d.setup)}<span className="muted"> + {gbp(d.monthly)}/mo</span></div>
                    <div className="deal-foot">
                      {!CLOSED.includes(stage)
                        ? <span className={`age${quiet ? " quiet" : ""}`} suppressHydrationWarning title={age <= 0 ? "Updated today" : `Last changed ${age} day${age === 1 ? "" : "s"} ago`}><Clock size={12} aria-hidden /> {age <= 0 ? "Today" : `${age}d`}</span>
                        : <span className="age">{stageLabel(stage)}</span>}
                      <div className="deal-actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" disabled={idx === 0} onClick={() => move(d.id, stages[idx - 1])} aria-label={`Move ${d.title} back to ${stageLabel(stages[idx - 1] ?? "")}`} title={idx > 0 ? `Back to ${stageLabel(stages[idx - 1])}` : ""}><ChevronLeft size={14} /></button>
                        <button type="button" disabled={idx === stages.length - 1} onClick={() => move(d.id, stages[idx + 1])} aria-label={`Move ${d.title} on to ${stageLabel(stages[idx + 1] ?? "")}`} title={idx < stages.length - 1 ? `On to ${stageLabel(stages[idx + 1])}` : ""}><ChevronRight size={14} /></button>
                        <a href={`/deals/${d.id}`} target="_blank" rel="noreferrer" title="Open in a new tab" aria-label="Open in a new tab"><ExternalLink size={13} /></a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>

      {openId !== null && <DealDrawer dealId={openId} stage={deals.find((d) => d.id === openId)?.stage} onMove={move} onClose={() => setOpenId(null)} />}
      {creating && <NewDealDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); router.refresh(); setOpenId(id); }} />}
      {lost && <LostDialog title={lost.title} onCancel={() => setLost(null)} onConfirm={(reason) => { const d = lost; setLost(null); move(d.id, "Lost", reason); }} />}
    </>
  );
}
