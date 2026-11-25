"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { saveClientPageAction } from "@/lib/buildPlanActions";
import { pageDraft, type ClientPage, type PageDraft } from "@/lib/buildPlanPageMath";
import ClientPageView, { type FieldOptions, type PageEdit } from "./ClientPageView";

const same = (a: PageDraft, b: PageDraft) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);
/** Rows for a box whose text wraps at roughly `per` characters, for browsers where a box cannot yet size itself to its text. */
const rowsFor = (text: string, per: number) => Math.max(1, text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / per)), 0));

// The client page with every piece of text turned into a box to type in, laid out as it will be shown (/proposals/[id]/build-plan?edit=1).
// The owner's own words: saved only when they press Save (or Cmd/Ctrl+S), refused only for contact details. No AI runs, nothing is sent.
export default function ClientPageEditor({ id, page, title, brand, sender, inverse, fontClass, viewHref }: {
  id: number; page: ClientPage; title: string; brand: string; sender: string | null; inverse: "light" | "dark"; fontClass: string; viewHref: string;
}) {
  const initial = useMemo(() => pageDraft(page, title), [page, title]);
  const [draft, setDraft] = useState<PageDraft>(initial);
  const [saved, setSaved] = useState<PageDraft>(initial);
  const [note, setNote] = useState<{ bad: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = !same(draft, saved);

  // After a save the server sends the page back as it was stored (tidied), so the boxes show exactly what the client will see.
  useEffect(() => { setDraft(initial); setSaved(initial); }, [initial]);

  const save = useCallback(() => {
    if (pending) return;
    const sent = draft;
    start(async () => {
      const form = new FormData();
      form.set("id", String(id));
      form.set("value", JSON.stringify(sent));
      try {
        const r = await saveClientPageAction(form);
        if (r?.error) { setNote({ bad: true, text: r.error }); return; }
        setSaved(sent);
        setNote({ bad: false, text: `Saved at ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` });
      } catch (err) {
        setNote({ bad: true, text: err instanceof Error ? err.message : String(err) });
      }
    });
  }, [draft, id, pending]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); } };
    const onLeave = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onLeave); };
  }, [dirty, save]);

  const edit: PageEdit = {
    field: (key: string, o: FieldOptions) => {
      const value = draft[key] ?? "";
      const common = {
        className: `cp-field${o.lines ? " cp-field-lines" : ""}`, value, "aria-label": o.label, placeholder: o.placeholder, maxLength: o.lines ? undefined : o.max,
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setDraft((d) => ({ ...d, [key]: e.target.value })); setNote(null); },
      };
      return o.multi ? <textarea key={key} {...common} rows={rowsFor(value || o.placeholder || "", o.per ?? 60)} /> : <input key={key} type="text" {...common} />;
    },
  };

  const bar = (
    <div className="cp-bar noprint" role="region" aria-label="Editing the client page">
      <div className="cp-bar-in">
        <div className="cp-bar-text">
          <strong>Editing the client page</strong>
          <span>Click any text to change it. Only you see this bar.</span>
        </div>
        <div className="cp-bar-actions">
          {note ? <span className={note.bad ? "cp-bar-bad" : "cp-bar-good"} role={note.bad ? "alert" : "status"}>{note.text}</span> : dirty ? <span className="cp-bar-quiet" role="status">Unsaved changes</span> : null}
          <button type="button" onClick={save} disabled={pending || !dirty}>{pending ? "Saving…" : "Save changes"}</button>
          <a className="btn secondary" href={viewHref}>View the page</a>
          <a className="cp-bar-back" href={`/proposals/${id}?tab=build`}>Back to the build plan</a>
        </div>
      </div>
    </div>
  );

  return <ClientPageView page={page} title={title} brand={brand} sender={sender} inverse={inverse} fontClass={fontClass} edit={edit} top={bar} />;
}
