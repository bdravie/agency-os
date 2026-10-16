"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Plus, Search } from "lucide-react";
import { moveContent } from "@/lib/actions";
import { CONTENT_META, CONTENT_STATUSES, contentLabel, type ContentStatus } from "@/lib/stages";
import { useToast } from "./Toast";
import ContentDrawer from "./ContentDrawer";
import NewIdeaDialog from "./NewIdeaDialog";
import { LaneTab } from "./ui";

export type Item = { id: number; idea: string; format: string | null; status: string; keyword: string | null; day: string | null };

const shortDate = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function ContentBoard({ initial }: { initial: Item[] }) {
  const toast = useToast();
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [over, setOver] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");
  const [, start] = useTransition();

  useEffect(() => setItems(initial), [initial]);
  const needle = filter.trim().toLowerCase();

  function move(id: number, status: string) {
    const item = items.find((i) => i.id === id);
    if (!item || item.status === status) return;
    const before = items;
    setItems(items.map((i) => (i.id === id ? { ...i, status } : i))); // optimistic
    start(async () => {
      try { await moveContent(id, status); toast(`Moved to ${contentLabel(status)}`); }
      catch (err) { setItems(before); toast(`Could not move it: ${err instanceof Error ? err.message : err}`, "bad"); }
    });
  }

  return (
    <>
      <div className="board-toolbar">
        <div className="search-field">
          <Search size={15} aria-hidden />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter ideas…" aria-label="Filter ideas" />
        </div>
        <button type="button" onClick={() => setCreating(true)}><Plus size={16} aria-hidden /> New idea</button>
      </div>

      <div className="board scroll-cols" style={{ gridTemplateColumns: "repeat(4, minmax(220px, 1fr))" }}>
        {CONTENT_STATUSES.map((status, idx) => {
          const meta = CONTENT_META[status as ContentStatus];
          const col = items.filter((i) => i.status === status && (!needle || `${i.idea} ${i.format ?? ""} ${i.keyword ?? ""}`.toLowerCase().includes(needle)));
          return (
            <section
              key={status} aria-label={`${meta.label}, ${col.length} items`} className={`lane${over === status ? " over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOver(status); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); move(Number(e.dataTransfer.getData("text/plain")), status); }}
            >
              <LaneTab colour={meta.colour} label={meta.label} count={col.length} hint={meta.hint} />
              <div className="lane-body">
                {col.length === 0 && <div className="drop-hint">{needle ? "No matches" : "Drop an item here"}</div>}
                {col.map((i) => (
                  <article
                    key={i.id} className={`deal${openId === i.id ? " active" : ""}`} draggable tabIndex={0} role="button"
                    aria-label={`${i.idea}. Press Enter to open.`}
                    onClick={() => setOpenId(i.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(i.id); } }}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i.id))}
                  >
                    <div className="deal-top"><b>{i.idea}</b></div>
                    {(i.format || i.keyword) && <div className="muted">{[i.format, i.keyword && `keyword ${i.keyword}`].filter(Boolean).join(" · ")}</div>}
                    <div className="deal-foot">
                      {i.day ? <span className="age"><CalendarDays size={12} aria-hidden /> {shortDate(i.day)}</span> : <span className="age">Not scheduled</span>}
                      <div className="deal-actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" disabled={idx === 0} onClick={() => move(i.id, CONTENT_STATUSES[idx - 1])} aria-label={`Move back to ${contentLabel(CONTENT_STATUSES[idx - 1] ?? "")}`} title={idx > 0 ? `Back to ${contentLabel(CONTENT_STATUSES[idx - 1])}` : ""}><ChevronLeft size={14} /></button>
                        <button type="button" disabled={idx === CONTENT_STATUSES.length - 1} onClick={() => move(i.id, CONTENT_STATUSES[idx + 1])} aria-label={`Move on to ${contentLabel(CONTENT_STATUSES[idx + 1] ?? "")}`} title={idx < CONTENT_STATUSES.length - 1 ? `On to ${contentLabel(CONTENT_STATUSES[idx + 1])}` : ""}><ChevronRight size={14} /></button>
                        <a href={`/content/${i.id}`} target="_blank" rel="noreferrer" title="Open in a new tab" aria-label="Open in a new tab"><ExternalLink size={13} /></a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {openId !== null && (
        <ContentDrawer itemId={openId} status={items.find((i) => i.id === openId)?.status} onMove={move} onClose={() => setOpenId(null)} onChanged={() => router.refresh()} />
      )}
      {creating && <NewIdeaDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); router.refresh(); setOpenId(id); }} />}
    </>
  );
}
