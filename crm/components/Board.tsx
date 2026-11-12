"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, ChevronUp, Clock, ExternalLink, Plus, Search } from "lucide-react";
import { moveDeal } from "@/lib/actions";
import { STAGE_META, stageLabel, type Stage } from "@/lib/stages";
import { useToast } from "./Toast";
import DealDrawer from "./DealDrawer";
import LostDialog from "./LostDialog";
import NewDealDialog from "./NewDealDialog";
import SectionTabs from "./SectionTabs";
import StatusPicker from "./StatusPicker";

export type Deal = { id: number; title: string; stage: string; company_id: number | null; company_name: string | null; setup: number; monthly: number; updated: string };

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const CLOSED = ["Won", "Lost"];
const daysIn = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export default function Board({ initial, stages, tab = "all", deletedCount = 0 }: { initial: Deal[]; stages: readonly string[]; tab?: "all" | Stage; deletedCount?: number }) {
  const toast = useToast();
  const router = useRouter();
  const [deals, setDeals] = useState(initial);
  const [over, setOver] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [lost, setLost] = useState<Deal | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const toggleTier = (s: string) => setCollapsed((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]));
  const [, start] = useTransition();

  useEffect(() => setDeals(initial), [initial]);
  useEffect(() => { try { setShowClosed(localStorage.getItem("deals.showClosed") === "1"); } catch {} }, []);
  const toggleClosed = () => { const v = !showClosed; setShowClosed(v); try { localStorage.setItem("deals.showClosed", v ? "1" : "0"); } catch {} };

  const open = deals.filter((d) => !CLOSED.includes(d.stage));
  const visible = tab === "all" ? (showClosed ? stages : stages.filter((s) => !CLOSED.includes(s))) : [tab];
  const closedCount = deals.filter((d) => CLOSED.includes(d.stage)).length;
  const needle = filter.trim().toLowerCase();
  const matches = useMemo(() => (d: Deal) => !needle || `${d.title} ${d.company_name ?? ""}`.toLowerCase().includes(needle), [needle]);

  function move(id: number, stage: string, reason?: string, note?: string) {
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.stage === stage) return;
    if (stage === "Lost" && reason === undefined) { setLost(deal); return; } // ask why first
    const before = deals;
    setDeals(deals.map((d) => (d.id === id ? { ...d, stage, updated: new Date().toISOString() } : d))); // optimistic
    start(async () => {
      try { await moveDeal(id, stage, reason || undefined, note); toast(`${deal.company_name ?? deal.title.split(":")[0]} → ${stageLabel(stage)}`); }
      catch (err) { setDeals(before); toast(`Could not move the deal: ${err instanceof Error ? err.message : err}`, "bad"); }
    });
  }

  return (
    <>
      <SectionTabs
        label="Deal pipeline"
        current={tab}
        tabs={[
          { key: "all", label: "All", href: "/deals", count: open.length },
          ...stages.map((s) => {
            const inStage = deals.filter((d) => d.stage === s);
            const isClosed = CLOSED.includes(s);
            return {
              key: s,
              label: STAGE_META[s as Stage].label,
              href: `/deals?tab=${encodeURIComponent(s)}`,
              count: inStage.length,
              hot: !isClosed && inStage.some((d) => daysIn(d.updated) >= 7),
            };
          }),
        ]}
        right={[{ key: "deleted", label: "Deleted", href: "/deals/deleted", count: deletedCount }]}
      />

      <div className="board-toolbar">
        <div className="search-field">
          <Search size={15} aria-hidden />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter deals…" aria-label="Filter deals" />
        </div>
        <div className="row">
          {tab === "all" && <button type="button" className="secondary" onClick={toggleClosed} aria-pressed={showClosed}>{showClosed ? "Hide won and lost" : `Show won and lost (${closedCount})`}</button>}
          <button type="button" onClick={() => setCreating(true)}><Plus size={16} aria-hidden /> New deal</button>
        </div>
      </div>

      <div className="tiers">
        {visible.map((stage) => {
          const meta = STAGE_META[stage as Stage];
          const col = deals.filter((d) => d.stage === stage && matches(d));
          const idx = stages.indexOf(stage);
          const next = stages[idx + 1];
          const isClosed = CLOSED.includes(stage);
          const folded = collapsed.includes(stage);
          return (
            <section
              key={stage} aria-label={`${meta.label}, ${col.length} deals`}
              className={`tier${over === stage ? " over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOver(stage); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); move(Number(e.dataTransfer.getData("text/plain")), stage); }}
            >
              <header className="tier-head">
                <button type="button" className="tier-toggle" onClick={() => toggleTier(stage)} aria-expanded={!folded} aria-label={`${folded ? "Expand" : "Collapse"} ${meta.label}`}>
                  {folded ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                </button>
                <span className="tier-pill" style={{ background: meta.colour }}>{meta.label}</span>
                <span className="count">{col.length}</span>
                <span className="tier-hint">{meta.hint}</span>
                <span className="tier-total">{col.length ? `${gbp(col.reduce((s, d) => s + d.setup, 0))} setup · ${gbp(col.reduce((s, d) => s + d.monthly, 0))}/mo` : ""}</span>
              </header>
              {!folded && (
                <div className="tier-body">
                  {col.length === 0 ? <div className="drop-hint">{needle ? "No matches" : "Drop a deal here"}</div> : (
                    <>
                      <div className="tier-cols" aria-hidden><span>Deal</span><span>Company</span><span>Setup</span><span>Monthly</span><span>{isClosed ? "Status" : "In stage"}</span><span /></div>
                      {col.map((d) => {
                        const age = daysIn(d.updated);
                        const quiet = !isClosed && age >= 7;
                        return (
                          <article
                            key={d.id} className={`tier-row${openId === d.id ? " active" : ""}`} draggable tabIndex={0} role="button"
                            aria-label={`${d.title}. ${gbp(d.setup)} setup, ${gbp(d.monthly)} a month. Press Enter to open.`}
                            onClick={() => setOpenId(d.id)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(d.id); } }}
                            onDragStart={(e) => e.dataTransfer.setData("text/plain", String(d.id))}
                          >
                            <b className="tier-title">{d.title}</b>
                            <span className="muted tier-company">
                              {d.company_id && !d.title.startsWith(d.company_name ?? "\u0000")
                                ? <Link href={`/companies/${d.company_id}`} onClick={(e) => e.stopPropagation()}>{d.company_name}</Link> : "—"}
                            </span>
                            <span className="tier-num">{gbp(d.setup)}</span>
                            <span className="tier-num">{gbp(d.monthly)}/mo</span>
                            {!isClosed
                              ? <span className={`age${quiet ? " quiet" : ""}`} suppressHydrationWarning title={age <= 0 ? "Updated today" : `Last changed ${age} day${age === 1 ? "" : "s"} ago`}><Clock size={12} aria-hidden /> {age <= 0 ? "Today" : `${age}d`}</span>
                              : <span className="age">{stageLabel(stage)}</span>}
                            <div className="tier-actions" onClick={(e) => e.stopPropagation()}>
                              <StatusPicker stage={stage} stages={stages} label={d.title} onPick={(s) => move(d.id, s)} />
                              {next && !isClosed && stage !== "Proposal sent" && (
                                <button type="button" className="tier-done" onClick={() => move(d.id, next)} title={`Done, move down to ${stageLabel(next)}`}>
                                  <Check size={13} aria-hidden /> {stageLabel(next)}
                                </button>
                              )}
                              {stage === "Proposal sent" && <button type="button" className="tier-done" onClick={() => move(d.id, "Won")}><Check size={13} aria-hidden /> Won</button>}
                              <button type="button" disabled={idx === 0} onClick={() => move(d.id, stages[idx - 1])} aria-label={`Move ${d.title} back up to ${stageLabel(stages[idx - 1] ?? "")}`} title={idx > 0 ? `Back up to ${stageLabel(stages[idx - 1])}` : ""}><ChevronUp size={14} /></button>
                              <a href={`/deals/${d.id}`} target="_blank" rel="noreferrer" title="Open in a new tab" aria-label="Open in a new tab"><ExternalLink size={13} /></a>
                            </div>
                          </article>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {openId !== null && <DealDrawer dealId={openId} stage={deals.find((d) => d.id === openId)?.stage} onMove={move} onClose={() => setOpenId(null)} />}
      {creating && <NewDealDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); router.refresh(); setOpenId(id); }} />}
      {lost && <LostDialog title={lost.title} onCancel={() => setLost(null)} onConfirm={(reason, note) => { const d = lost; setLost(null); move(d.id, "Lost", reason, note); }} />}
    </>
  );
}
