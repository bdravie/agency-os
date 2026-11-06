"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Check, ChevronDown, ChevronRight, ChevronUp, Clock, ExternalLink, Plus, Search, Trash2 } from "lucide-react";
import { moveProposal, restoreProposals } from "@/lib/proposalActions";
import {
  PROPOSAL_LOST_REASONS, PROPOSAL_META, PROPOSAL_STATUSES, archiveLabel, cannotDelete, daysSince, isClosed, isQuiet, nextStatus, previousStatus, proposalLostLabel, statusLabel,
} from "@/lib/proposalStatus";
import { proposalName } from "@/lib/proposalName";
import { useToast } from "./Toast";
import LostDialog from "./LostDialog";
import StatusPicker from "./StatusPicker";
import { ArchiveDialog, DeleteDialog } from "./ProposalDialogs";
import "@/app/proposals/pipeline.css";

export type ProposalRow = {
  id: number; job_title: string | null; company_name: string | null; job_url: string | null; fit_score: number | null; status: string; pitch_mode: string | null;
  connects_used: number | null; status_changed_at: string; archived_at: string | null; archive_reason: string | null; lost_reason: string | null;
};

const fitTone = (n: number | null) => (n === null ? "neutral" : n >= 8 ? "good" : n >= 6 ? "warn" : "bad");
const ARCHIVED = "Archived";

export default function ProposalBoard({ initial }: { initial: ProposalRow[] }) {
  const toast = useToast();
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [over, setOver] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [lost, setLost] = useState<ProposalRow | null>(null);
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [archiving, setArchiving] = useState<{ ids: number[]; label: string } | null>(null);
  const [deleting, setDeleting] = useState<{ ids: number[]; label: string } | null>(null);
  const [, start] = useTransition();

  useEffect(() => setRows(initial), [initial]);
  useEffect(() => {
    try { setShowClosed(localStorage.getItem("proposals.showClosed") === "1"); setShowArchived(localStorage.getItem("proposals.showArchived") === "1"); } catch {}
  }, []);
  const remember = (key: string, v: boolean) => { try { localStorage.setItem(key, v ? "1" : "0"); } catch {} };

  const live = rows.filter((r) => !r.archived_at);
  const archived = rows.filter((r) => r.archived_at);
  const needle = filter.trim().toLowerCase();
  const matches = useMemo(() => (r: ProposalRow) => !needle || `${proposalName(r)}`.toLowerCase().includes(needle), [needle]);
  const open = live.filter((r) => !isClosed(r.status));
  const visible = showClosed ? PROPOSAL_STATUSES : PROPOSAL_STATUSES.filter((s) => !isClosed(s));
  const toggleTier = (s: string) => setCollapsed((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]));
  const byId = (id: number) => rows.find((r) => r.id === id);

  function move(id: number, status: string, reason?: string, note?: string) {
    const row = byId(id);
    if (!row || row.status === status) return;
    if (status === "Lost" && reason === undefined) { setLost(row); return; } // ask why first
    const before = rows;
    setRows(rows.map((r) => (r.id === id ? { ...r, status, status_changed_at: new Date().toISOString(), lost_reason: status === "Lost" ? reason ?? null : null } : r))); // optimistic
    start(async () => {
      try { await moveProposal(id, status, reason, note); toast(`${proposalName(row)} → ${statusLabel(status)}`); router.refresh(); }
      catch (err) { setRows(before); toast(`Could not move the proposal: ${err instanceof Error ? err.message : err}`, "bad"); }
    });
  }

  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleMany = (ids: number[]) => setPicked((p) => (ids.every((i) => p.includes(i)) ? p.filter((x) => !ids.includes(x)) : [...new Set([...p, ...ids])]));
  const pickedRows = picked.map(byId).filter((r): r is ProposalRow => !!r);
  const pickedLive = pickedRows.filter((r) => !r.archived_at).map((r) => r.id);
  const pickedArchived = pickedRows.filter((r) => r.archived_at).map((r) => r.id);
  const pickedDeletable = pickedRows.filter((r) => !cannotDelete(r));
  const describe = (list: ProposalRow[]) => list.length === 1 ? proposalName(list[0]) : `${list.length} proposals`;
  const finished = (msg: string) => { setPicked([]); setArchiving(null); setDeleting(null); toast(msg); router.refresh(); };

  function restore(ids: number[]) {
    start(async () => {
      const r = await restoreProposals(ids);
      if ("error" in r) { toast(r.error, "bad"); return; }
      finished(`${r.done} proposal${r.done === 1 ? "" : "s"} restored`);
    });
  }

  const renderRow = (r: ProposalRow, tier: string) => {
    const isArch = !!r.archived_at;
    const closed = isClosed(r.status);
    const age = daysSince(r.status_changed_at);
    const quiet = !isArch && isQuiet(r);
    const next = nextStatus(r.status);
    const back = previousStatus(r.status);
    const name = proposalName(r);
    return (
      <article
        key={r.id} className={`tier-row${isArch ? " archived" : ""}`} draggable={!isArch} tabIndex={0} role="button" aria-label={`${name}. ${statusLabel(r.status)}. Press Enter to open.`}
        onClick={() => router.push(`/proposals/${r.id}`)}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); router.push(`/proposals/${r.id}`); } }}
        onDragStart={(e) => e.dataTransfer.setData("text/plain", String(r.id))}
      >
        <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} aria-label={`Select ${name}`} />
        <b className="tier-title">
          <Link href={`/proposals/${r.id}`} onClick={(e) => e.stopPropagation()}>{name}</Link>
          {r.pitch_mode === "loom" && <span className="badge tone-violet" style={{ marginLeft: 8 }}>Loom</span>}
          {isArch && <span className="badge tone-neutral" style={{ marginLeft: 8 }} title={archiveLabel(r.archive_reason)}>{statusLabel(r.status)}</span>}
        </b>
        <span className="tier-fit">{r.fit_score !== null && <span className={`badge tone-${fitTone(r.fit_score)}`}>{r.fit_score}/10</span>}</span>
        <span className="tier-num muted">{r.connects_used ?? 0} connects</span>
        {isArch ? <span className="age" title={archiveLabel(r.archive_reason)}>{archiveLabel(r.archive_reason)}</span>
          : closed ? <span className="age">{r.status === "Lost" ? proposalLostLabel(r.lost_reason) : "Hired"}</span>
          : <span className={`age${quiet ? " quiet" : ""}`} suppressHydrationWarning title={age <= 0 ? "Changed today" : `No change for ${age} day${age === 1 ? "" : "s"}${quiet ? ". Time to follow up on Upwork?" : ""}`}><Clock size={12} aria-hidden /> {age <= 0 ? "Today" : `${age}d`}</span>}
        <div className="tier-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {isArch ? (
            <>
              <button type="button" onClick={() => restore([r.id])} title="Put it back in the pipeline"><ArchiveRestore size={13} aria-hidden /> Restore</button>
              <button type="button" className="danger" onClick={() => setDeleting({ ids: [r.id], label: name })} aria-label={`Delete ${name}`} title="Delete for good"><Trash2 size={13} /></button>
            </>
          ) : (
            <>
              <StatusPicker stage={r.status} stages={PROPOSAL_STATUSES} label={name} onPick={(s) => move(r.id, s)} meta={PROPOSAL_META} />
              {next && <button type="button" className="tier-done" onClick={() => move(r.id, next)} title={`Done, move on to ${statusLabel(next)}`}><Check size={13} aria-hidden /> {statusLabel(next)}</button>}
              {back && <button type="button" onClick={() => move(r.id, back)} aria-label={`Move ${name} back to ${statusLabel(back)}`} title={`Back to ${statusLabel(back)}`}><ChevronUp size={14} /></button>}
              <button type="button" onClick={() => setArchiving({ ids: [r.id], label: name })} aria-label={`Archive ${name}`} title="Not pursuing: archive"><Archive size={13} /></button>
              {/^https?:\/\//i.test(r.job_url ?? "") && <a href={r.job_url!} target="_blank" rel="noreferrer" aria-label={`Open ${name} on Upwork`} title="Open on Upwork"><ExternalLink size={13} /></a>}
            </>
          )}
        </div>
      </article>
    );
  };

  const renderTier = (key: string, label: string, hint: string, colour: string, col: ProposalRow[], droppable: boolean) => {
    const folded = collapsed.includes(key);
    const ids = col.map((r) => r.id);
    return (
      <section
        key={key} aria-label={`${label}, ${col.length} proposals`} className={`tier${over === key ? " over" : ""}`}
        onDragOver={droppable ? (e) => { e.preventDefault(); setOver(key); } : undefined}
        onDragLeave={droppable ? () => setOver(null) : undefined}
        onDrop={droppable ? (e) => { e.preventDefault(); setOver(null); move(Number(e.dataTransfer.getData("text/plain")), key); } : undefined}
      >
        <header className="tier-head">
          <button type="button" className="tier-toggle" onClick={() => toggleTier(key)} aria-expanded={!folded} aria-label={`${folded ? "Expand" : "Collapse"} ${label}`}>
            {folded ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          </button>
          <span className="tier-pill" style={{ background: colour }}>{label}</span>
          <span className="count">{col.length}</span>
          <span className="tier-hint">{hint}</span>
        </header>
        {!folded && (
          <div className="tier-body">
            {col.length === 0 ? <div className="drop-hint">{needle ? "No matches" : droppable ? "Drop a proposal here" : "Nothing archived"}</div> : (
              <>
                <div className="tier-cols">
                  <input type="checkbox" checked={ids.every((i) => picked.includes(i))} onChange={() => toggleMany(ids)} aria-label={`Select all in ${label}`} />
                  <span>Job</span><span>Fit</span><span>Connects</span><span>{key === ARCHIVED ? "Reason" : isClosed(key) ? "Outcome" : "In status"}</span><span />
                </div>
                {col.map((r) => renderRow(r, key))}
              </>
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <>
      <div className="board-toolbar">
        <div className="search-field">
          <Search size={15} aria-hidden />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter proposals…" aria-label="Filter proposals" />
        </div>
        <div className="row">
          <button type="button" className="secondary" aria-pressed={showClosed} onClick={() => { const v = !showClosed; setShowClosed(v); remember("proposals.showClosed", v); }}>
            {showClosed ? "Hide won and lost" : `Show won and lost (${live.filter((r) => isClosed(r.status)).length})`}
          </button>
          <button type="button" className="secondary" aria-pressed={showArchived} onClick={() => { const v = !showArchived; setShowArchived(v); remember("proposals.showArchived", v); }}>
            {showArchived ? "Hide archived" : `Show archived (${archived.length})`}
          </button>
          <Link href="/proposals/new" className="btn"><Plus size={16} aria-hidden /> New proposal</Link>
        </div>
      </div>

      {picked.length > 0 && (
        <div className="prop-bulk" role="region" aria-label="Selected proposals">
          <b>{picked.length} selected</b>
          {pickedLive.length > 0 && <button type="button" className="secondary" onClick={() => setArchiving({ ids: pickedLive, label: describe(pickedRows.filter((r) => !r.archived_at)) })}><Archive size={14} aria-hidden /> Archive {pickedLive.length}</button>}
          {pickedArchived.length > 0 && <button type="button" className="secondary" onClick={() => restore(pickedArchived)}><ArchiveRestore size={14} aria-hidden /> Restore {pickedArchived.length}</button>}
          <button type="button" className="secondary danger" disabled={pickedDeletable.length === 0} onClick={() => setDeleting({ ids: pickedDeletable.map((r) => r.id), label: describe(pickedDeletable) })}
            title={pickedDeletable.length === pickedRows.length ? "Delete for good" : "Only drafts and archived proposals can be deleted; the rest are left alone."}>
            <Trash2 size={14} aria-hidden /> Delete {pickedDeletable.length}{pickedDeletable.length < pickedRows.length ? ` of ${pickedRows.length}` : ""}
          </button>
          <button type="button" className="secondary" onClick={() => setPicked([])}>Clear</button>
        </div>
      )}

      <p className="muted" style={{ marginTop: 0 }}>{open.length} open · click a job for details, or drag it to another status. Tick boxes to archive or delete several at once.</p>

      <div className="tiers prop-tiers">
        {visible.map((s) => renderTier(s, PROPOSAL_META[s].label, PROPOSAL_META[s].hint, PROPOSAL_META[s].colour, live.filter((r) => r.status === s && matches(r)), true))}
        {showArchived && renderTier(ARCHIVED, "Archived", "Not pursuing. Restore or delete.", "var(--st-new)", archived.filter(matches), false)}
      </div>

      {lost && <LostDialog title={proposalName(lost)} reasons={PROPOSAL_LOST_REASONS} onCancel={() => setLost(null)} onConfirm={(reason, note) => { const r = lost; setLost(null); move(r.id, "Lost", reason, note); }} />}
      {archiving && <ArchiveDialog target={archiving} onClose={() => setArchiving(null)} onDone={(n) => finished(`${n} proposal${n === 1 ? "" : "s"} archived`)} />}
      {deleting && (
        <DeleteDialog target={deleting} sentCount={deleting.ids.filter((i) => byId(i) && byId(i)!.status !== "Draft").length} onClose={() => setDeleting(null)}
          onDone={(n, skipped) => finished(`${n} proposal${n === 1 ? "" : "s"} deleted. The reason is in the deletion log.${skipped.length ? ` Skipped: ${skipped.join(" ")}` : ""}`)} />
      )}
    </>
  );
}
