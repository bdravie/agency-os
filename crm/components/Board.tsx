"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { moveDeal } from "@/lib/actions";

export type Deal = { id: number; title: string; stage: string; company_id: number | null; company_name: string | null; setup: number; monthly: number };

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const DOT: Record<string, string> = { New: "var(--muted)", Contacted: "var(--accent)", Replied: "var(--violet)", "Call booked": "var(--warn)", "Proposal sent": "var(--cyan)", Won: "var(--good)", Lost: "var(--bad)" };

export default function Board({ initial, stages }: { initial: Deal[]; stages: readonly string[] }) {
  const [deals, setDeals] = useState(initial);
  const [over, setOver] = useState<string | null>(null);
  const [, start] = useTransition();

  function drop(stage: string, e: React.DragEvent) {
    e.preventDefault();
    setOver(null);
    move(Number(e.dataTransfer.getData("text/plain")), stage);
  }

  function move(id: number, stage: string) {
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.stage === stage) return;
    const reason = stage === "Lost" ? window.prompt("Why was it lost? (optional)") ?? undefined : undefined;
    const before = deals;
    setDeals(deals.map((d) => (d.id === id ? { ...d, stage } : d))); // optimistic
    start(async () => {
      try { await moveDeal(id, stage, reason); }
      catch (err) { console.error("moveDeal failed", err); setDeals(before); window.alert(`Could not move the deal: ${err instanceof Error ? err.message : err}`); }
    });
  }

  return (
    <div className="board">
      {stages.map((stage) => {
        const col = deals.filter((d) => d.stage === stage);
        return (
          <section
            key={stage}
            className={`col${over === stage ? " over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(stage); }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => drop(stage, e)}
          >
            <h2><span className="row" style={{ gap: 8, background: "none", padding: 0 }}><i className="dot" style={{ background: DOT[stage] }} aria-hidden />{stage}</span> <span>{col.length}</span></h2>
            <p className="muted totals">{gbp(col.reduce((s, d) => s + d.setup, 0))} setup · {gbp(col.reduce((s, d) => s + d.monthly, 0))}/mo</p>
            {col.map((d) => (
              <article key={d.id} className="deal" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(d.id))}>
                <b>{d.title}</b>
                {d.company_id && !d.title.startsWith(d.company_name ?? "\u0000") && <Link href={`/companies/${d.company_id}`} className="muted">{d.company_name}</Link>}
                <span className="muted">{gbp(d.setup)} setup · {gbp(d.monthly)}/mo</span>
                <div className="moves">
                  <button disabled={stages.indexOf(stage) === 0} onClick={() => move(d.id, stages[stages.indexOf(stage) - 1])} title="Move back">◀</button>
                  <button disabled={stages.indexOf(stage) === stages.length - 1} onClick={() => move(d.id, stages[stages.indexOf(stage) + 1])} title="Move forward">▶</button>
                </div>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
