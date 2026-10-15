"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { moveContent } from "@/lib/actions";

export type Item = { id: number; idea: string; format: string | null; status: string; keyword: string | null };
const STATUSES = ["Idea", "Scripted", "Filmed", "Posted"];

export default function ContentBoard({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const [, start] = useTransition();

  function move(id: number, status: string) {
    const before = items;
    setItems(items.map((i) => (i.id === id ? { ...i, status } : i)));
    start(async () => {
      try { await moveContent(id, status); }
      catch (err) { setItems(before); window.alert(`Could not move: ${err instanceof Error ? err.message : err}`); }
    });
  }

  return (
    <div className="board scroll-cols" style={{ gridTemplateColumns: "repeat(4, minmax(240px, 1fr))" }}>
      {STATUSES.map((status, idx) => {
        const col = items.filter((i) => i.status === status);
        return (
          <section key={status} className="col">
            <h2><span style={{ background: "none", padding: 0 }}>{status}</span> <span>{col.length}</span></h2>
            {col.map((i) => (
              <article key={i.id} className="deal" style={{ cursor: "default" }}>
                <Link href={`/content/${i.id}`}><b>{i.idea}</b></Link>
                <span className="muted">{[i.format, i.keyword && `keyword ${i.keyword}`].filter(Boolean).join(" · ")}</span>
                <div className="moves">
                  <button disabled={idx === 0} onClick={() => move(i.id, STATUSES[idx - 1])} title="Move back" aria-label="Move back"><ChevronLeft size={15} /></button>
                  <button disabled={idx === STATUSES.length - 1} onClick={() => move(i.id, STATUSES[idx + 1])} title="Move forward" aria-label="Move forward"><ChevronRight size={15} /></button>
                </div>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
