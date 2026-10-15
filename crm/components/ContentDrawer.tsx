"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Copy, ExternalLink, X } from "lucide-react";
import { scheduleContent, writeScriptAction } from "@/lib/actions";
import { ago } from "@/lib/format";
import { CONTENT_META, CONTENT_STATUSES, type ContentStatus } from "@/lib/stages";
import ActionForm from "./ActionForm";
import ToastForm from "./ToastForm";
import { useToast } from "./Toast";

type Item = { id: number; idea: string; hook: string | null; format: string | null; script: string | null; caption: string | null; keyword: string | null; status: string; posted_at: string | null; created_at: string; day: string | null };

// Quick view of a content item. "Open full page" goes to /content/[id] in a new tab, where you can edit everything.
export default function ContentDrawer({ itemId, status, onMove, onClose, onChanged }: { itemId: number; status?: string; onMove: (id: number, status: string) => void; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);

  const load = useCallback(() => {
    fetch(`/api/content/${itemId}`).then(async (r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load this item."))))
      .then((d) => { setItem(d.item); setError(null); }).catch((e) => setError(e.message));
  }, [itemId]);
  const refresh = () => { load(); onChanged(); };

  useEffect(() => { setItem(null); load(); }, [load]);
  useEffect(() => { panel.current?.focus(); }, [itemId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const current = (status ?? item?.status ?? "Idea") as ContentStatus;
  const meta = CONTENT_META[current];
  const copy = async (text: string, label: string) => { await navigator.clipboard.writeText(text); toast(`${label} copied`); };

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} aria-hidden />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={item ? `Content: ${item.idea}` : "Content"} tabIndex={-1} ref={panel}>
        <header className="drawer-head">
          <div style={{ minWidth: 0 }}>
            <div className="muted">{item?.format ?? "Content idea"}</div>
            <h2 className="drawer-title">{item?.idea ?? "Loading…"}</h2>
          </div>
          <div className="row" style={{ gap: 4, flex: "none" }}>
            <a href={`/content/${itemId}`} target="_blank" rel="noreferrer" className="btn secondary" title="Open the full page in a new tab"><ExternalLink size={15} aria-hidden /> Open full page</a>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </header>

        {error && <p className="error" style={{ padding: 20 }}>{error}</p>}
        {!item && !error && <p className="muted" style={{ padding: 20 }}>Loading…</p>}

        {item && (
          <div className="drawer-body">
            <section>
              <div className="field-label">Stage</div>
              <div className="stagebar" role="group" aria-label="Content stage">
                {CONTENT_STATUSES.map((s) => (
                  <button key={s} type="button" onClick={() => onMove(itemId, s)} title={CONTENT_META[s].hint} aria-pressed={s === current}
                    className={`stage-chip${s === current ? " on" : ""}`}><i className="dot" style={{ background: CONTENT_META[s].colour }} aria-hidden />{CONTENT_META[s].label}</button>
                ))}
              </div>
              <div className="next" style={{ marginTop: 12 }}>
                <div><div className="next-label">{meta.label}: {meta.hint}</div><b style={{ fontWeight: 550 }}>{meta.next}</b></div>
              </div>
            </section>

            <section className="kv" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              <div><div className="field-label">Keyword</div><div className="kv-value small">{item.keyword ?? "Not set"}</div></div>
              <div><div className="field-label">Scheduled</div><div className="kv-value small">{item.day ?? "Not set"}</div></div>
              <div><div className="field-label">Created</div><div className="kv-value small">{ago(item.created_at)}</div></div>
            </section>

            {!item.script ? (
              <section>
                <div className="field-label">Script</div>
                <p className="muted">No script yet. The AI writes 5 hooks, a 30–45 second script, on-screen text and a caption.</p>
                <ActionForm action={writeScriptAction} label="Write script with AI" busyLabel="Writing… (about 15 seconds)" onDone={refresh}>
                  <input type="hidden" name="id" value={itemId} />
                </ActionForm>
              </section>
            ) : (
              <>
                {item.hook && (
                  <section>
                    <div className="row-between"><div className="field-label">Chosen hook</div><button type="button" className="link" onClick={() => copy(item.hook!, "Hook")}><Copy size={13} aria-hidden /> Copy</button></div>
                    <p style={{ fontWeight: 550, margin: 0 }}>{item.hook}</p>
                  </section>
                )}
                <section>
                  <div className="row-between"><div className="field-label">Script</div><button type="button" className="link" onClick={() => copy(item.script!, "Script")}><Copy size={13} aria-hidden /> Copy</button></div>
                  <pre className="script-box">{item.script}</pre>
                </section>
                {item.caption && (
                  <section>
                    <div className="row-between"><div className="field-label">Caption</div><button type="button" className="link" onClick={() => copy(item.caption!, "Caption")}><Copy size={13} aria-hidden /> Copy</button></div>
                    <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{item.caption}</p>
                  </section>
                )}
                <section>
                  <ActionForm action={writeScriptAction} label="Rewrite script" busyLabel="Writing… (about 15 seconds)" onDone={refresh} secondary>
                    <input type="hidden" name="id" value={itemId} />
                  </ActionForm>
                </section>
              </>
            )}

            <section>
              <div className="field-label">Schedule</div>
              <ToastForm action={scheduleContent} success="Date saved" onDone={refresh} className="row">
                <input type="hidden" name="id" value={itemId} />
                <CalendarDays size={16} aria-hidden />
                <input type="date" name="date" defaultValue={item.day ?? ""} aria-label="Date" />
                <button className="secondary">{item.day ? "Reschedule" : "Schedule"}</button>
                <Link href="/content/calendar" className="muted">Open calendar</Link>
              </ToastForm>
            </section>
          </div>
        )}
      </aside>
    </>
  );
}

