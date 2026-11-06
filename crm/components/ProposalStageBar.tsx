"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { moveProposal } from "@/lib/proposalActions";
import { PROPOSAL_LOST_REASONS, PROPOSAL_META, PROPOSAL_STATUSES, proposalLostLabel } from "@/lib/proposalStatus";
import { useToast } from "./Toast";
import LostDialog from "./LostDialog";

// Where a proposal is on its way from Draft to Won. Same chips as a deal's stage bar. Lost asks why first.
export default function ProposalStageBar({ id, status, title, lostReason }: { id: number; status: string; title: string; lostReason: string | null }) {
  const [current, setCurrent] = useState(status);
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const idx = PROPOSAL_STATUSES.indexOf(current as (typeof PROPOSAL_STATUSES)[number]);

  function go(next: string, reason?: string, note?: string) {
    if (next === current) return;
    if (next === "Lost" && reason === undefined) { setAsking(true); return; }
    const before = current;
    setCurrent(next);
    start(async () => {
      try { await moveProposal(id, next, reason, note); toast(`Moved to ${PROPOSAL_META[next as keyof typeof PROPOSAL_META].label}`); router.refresh(); }
      catch (err) { setCurrent(before); toast(`Could not move the proposal: ${err instanceof Error ? err.message : err}`, "bad"); }
    });
  }
  return (
    <>
      <div className="stagebar" role="group" aria-label="Proposal status">
        {PROPOSAL_STATUSES.map((s, i) => {
          const m = PROPOSAL_META[s];
          const done = idx >= 0 && s !== "Lost" && current !== "Lost" && i < idx;
          return (
            <button key={s} type="button" disabled={pending} onClick={() => go(s)} title={m.hint} aria-pressed={s === current}
              className={`stage-chip${s === current ? " on" : ""}${done ? " done" : ""}${s === "Won" ? " won" : ""}${s === "Lost" ? " lost" : ""}`}>
              {done ? <Check size={12} aria-hidden /> : <i className="dot" style={{ background: m.colour }} aria-hidden />}
              {m.label}
            </button>
          );
        })}
      </div>
      {current === "Lost" && lostReason && <p className="muted" style={{ margin: "6px 0 0" }}>Lost: {proposalLostLabel(lostReason)}</p>}
      {asking && <LostDialog title={title} reasons={PROPOSAL_LOST_REASONS} onCancel={() => setAsking(false)} onConfirm={(reason, note) => { setAsking(false); go("Lost", reason, note); }} />}
    </>
  );
}
