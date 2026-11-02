"use client";

import { useTransition } from "react";
import { Bookmark, RotateCcw, X } from "lucide-react";
import { reviewOutlier } from "@/lib/creatorActions";
import { useToast } from "./Toast";

export default function OutlierActions({ id, review }: { id: number; review: string }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const set = (r: "new" | "saved" | "dismissed", msg: string) => start(async () => { const x = await reviewOutlier(id, r); toast(x.ok ? msg : x.error, x.ok ? undefined : "bad"); });
  return (
    <div className="row" style={{ gap: 6 }}>
      {review !== "saved" && <button className="secondary" disabled={pending} onClick={() => set("saved", "Saved to your swipe file")}><Bookmark size={14} aria-hidden /> Save to swipe file</button>}
      {review !== "dismissed" && <button className="secondary" disabled={pending} onClick={() => set("dismissed", "Dismissed")}><X size={14} aria-hidden /> Dismiss</button>}
      {review !== "new" && <button className="link" disabled={pending} onClick={() => set("new", "Moved back to New")}><RotateCcw size={13} aria-hidden /> Back to New</button>}
    </div>
  );
}
