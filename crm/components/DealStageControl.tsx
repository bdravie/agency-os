"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveDeal } from "@/lib/actions";
import { stageLabel } from "@/lib/stages";
import DealStageBar from "./DealStageBar";
import LostDialog from "./LostDialog";
import { useToast } from "./Toast";

// Stage picker for the full deal page: same behaviour as on the board.
export default function DealStageControl({ dealId, title, stage }: { dealId: number; title: string; stage: string }) {
  const toast = useToast();
  const router = useRouter();
  const [current, setCurrent] = useState(stage);
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();

  function go(next: string, reason?: string, note?: string) {
    const before = current;
    setCurrent(next);
    start(async () => {
      try { await moveDeal(dealId, next, reason || undefined, note); toast(`Moved to ${stageLabel(next)}`); router.refresh(); }
      catch (err) { setCurrent(before); toast(`Could not move the deal: ${err instanceof Error ? err.message : err}`, "bad"); }
    });
  }

  return (
    <>
      <DealStageBar stage={current} disabled={pending} onPick={(s) => { if (s === current) return; if (s === "Lost") setAsking(true); else go(s); }} />
      {asking && <LostDialog title={title} onCancel={() => setAsking(false)} onConfirm={(r, n) => { setAsking(false); go("Lost", r, n); }} />}
    </>
  );
}
