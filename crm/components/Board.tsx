"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { moveDeal } from "@/lib/actions";
import { useToast } from "./Toast";

export type Deal = { id: number; title: string; stage: string; company_id: number | null; company_name: string | null; setup: number; monthly: number; updated: string };

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const DOT: Record<string, string> = { New: "var(--muted)", Contacted: "var(--accent)", Replied: "var(--violet)", "Call booked": "var(--warn)", "Proposal sent": "var(--cyan)", Won: "var(--good)", Lost: "var(--bad)" };
const CLOSED = ["Won", "Lost"];
const REASONS = ["Too expensive", "No response", "Chose someone else", "Bad timing", "Not a fit"];
const daysIn = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export default function Board({ initial, stages }: { initial: Deal[]; stages: readonly string[] }) {
  const toast = useToast();
  const [deals, setDeals] = useState(initial);
  const [over, setOver] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [lost, setLost] = useState<Deal | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [, start] = useTransition();

  useEffect(() => { try { setShowClosed(localStorage.getItem("deals.showClosed") === "1"); } catch {} }, []);
  const toggleClosed = () => { const v = !showClosed; setShowClosed(v); try { localStorage.setItem("deals.showClosed", v ? "1" : "0"); } catch {} };

  const visible = showClosed ? stages : stages.filter((s) => !CLOSED.includes(s));
  const closedCount = deals.filter((d) => CLOSED.includes(d.stage)).length;

  function move(id: number, stage: string, reason?: string) {
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.stage === stage) return;
    if (stage === "Lost" && reason === undefined) { setReasonText(""); setLost(deal); return; } // ask why first
    const before = deals;
    setDeals(deals.map((d) => (d.id === id ? { ...d, stage, updated: new Date().toISOString() } : d))); // optimistic
    start(async () => {
      try { await moveDeal(id, stage, reason || undefined); toast(`${deal.title.split(":")[0]} moved to ${stage}`); }
      catch (err) { setDeals(before); toast(`Could not move the deal: ${err instanceof Error ? err.message : err}`, "bad"); }
    });
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 12, justifyContent: "flex-end" }}>
        <button type="button" className="secondary" onClick={toggleClosed} aria-pressed={showClosed}>
          {showClosed ? "Hide won and lost" : `Show won and lost (${closedCount})`}
        </button>
      </div>

      <div className="board" style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(200px, 1fr))` }}>
        {visible.map((stage) => {
          const col = deals.filter((d) => d.stage === stage);
          const idx = stages.indexOf(stage);
          return (
            <section
              key={stage} aria-label={`${stage}, ${col.length} deals`}
              className={`col${over === stage ? " over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOver(stage); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); move(Number(e.dataTransfer.getData("text/plain")), stage); }}
            >
              <h2>
                <span className="row" style={{ gap: 8, background: "none", padding: 0 }}><i className="dot" style={{ background: DOT[stage] }} aria-hidden />{stage}</span>
                <span>{col.length}</span>
              </h2>
              <p className="muted totals">{gbp(col.reduce((s, d) => s + d.setup, 0))} setup · {gbp(col.reduce((s, d) => s + d.monthly, 0))}/mo</p>

              {col.length === 0 && <div className="drop-hint">Drop a deal here</div>}
              {col.map((d) => {
                const age = daysIn(d.updated);
                const quiet = !CLOSED.includes(stage) && age >= 7;
                return (
                  <article key={d.id} className="deal" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(d.id))}>
                    <b>{d.title}</b>
                    {d.company_id && !d.title.startsWith(d.company_name ?? "\u0000") && <Link href={`/companies/${d.company_id}`} className="muted">{d.company_name}</Link>}
                    <div className="row-between">
                      <span className="muted">{gbp(d.setup)} + {gbp(d.monthly)}/mo</span>
                      {!CLOSED.includes(stage) && <span className={`age${quiet ? " quiet" : ""}`} suppressHydrationWarning title="Time since this deal last changed">{age <= 0 ? "today" : `${age}d`}</span>}
                    </div>
                    <div className="moves">
                      <button type="button" disabled={idx === 0} onClick={() => move(d.id, stages[idx - 1])} aria-label={`Move ${d.title} back to ${stages[idx - 1] ?? ""}`} title={idx > 0 ? `Back to ${stages[idx - 1]}` : ""}><ChevronLeft size={15} /></button>
                      <button type="button" disabled={idx === stages.length - 1} onClick={() => move(d.id, stages[idx + 1])} aria-label={`Move ${d.title} forward to ${stages[idx + 1] ?? ""}`} title={idx < stages.length - 1 ? `On to ${stages[idx + 1]}` : ""}><ChevronRight size={15} /></button>
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>

      {lost && (
        <div className="palette-wrap" role="dialog" aria-modal="true" aria-label="Why was it lost?" onMouseDown={(e) => { if (e.target === e.currentTarget) setLost(null); }}>
          <form className="card stack dialog" onSubmit={(e) => { e.preventDefault(); const d = lost; setLost(null); move(d.id, "Lost", reasonText.trim()); }}>
            <h2 style={{ margin: 0 }}>Why was it lost?</h2>
            <p className="muted">{lost.title}</p>
            <div className="pills">
              {REASONS.map((r) => <button key={r} type="button" className={`pill${reasonText === r ? " on" : ""}`} onClick={() => setReasonText(r)}>{r}</button>)}
            </div>
            <input value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Or type a reason (optional)" aria-label="Reason" autoFocus />
            <div className="row"><button>Mark as lost</button><button type="button" className="secondary" onClick={() => setLost(null)}>Cancel</button></div>
          </form>
        </div>
      )}
    </>
  );
}
