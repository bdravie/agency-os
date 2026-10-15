"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { setChecklistItem } from "@/lib/offerActions";
import { useToast } from "./Toast";

// One deliverable on a deal's offer. Ticks instantly, saves in the background, and undoes itself if the save fails.
export default function ChecklistToggle({ lineId, index, text, done }: { lineId: number; index: number; text: string; done: boolean }) {
  const toast = useToast();
  const [on, setOn] = useState(done);
  const [, start] = useTransition();
  return (
    <button type="button" role="checkbox" aria-checked={on} className={`check-item${on ? " on" : ""}`} onClick={() => {
      const next = !on; setOn(next);
      start(async () => { try { await setChecklistItem(lineId, index, next); } catch (err) { setOn(!next); toast(`Could not save: ${err instanceof Error ? err.message : err}`, "bad"); } });
    }}>
      <span className="check-box" aria-hidden>{on && <Check size={13} />}</span>
      <span>{text}</span>
    </button>
  );
}
