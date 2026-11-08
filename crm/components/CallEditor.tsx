"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { saveCallDetails } from "@/lib/callActions";
import { CALL_KINDS, KIND_LABEL, type CallKind } from "@/lib/callEdit";
import { useToast } from "./Toast";

// Shows the owner's own notes (when this call has them) with an Edit button, and edits the title, date and type of any call or meeting.
// Saving is free: it never runs the AI. If the notes change after an analysis, the page says the analysis may be out of date.
export default function CallEditor({ id, title, day, kind, notes, edited }: {
  id: number; title: string; day: string; kind: CallKind;
  /** The saved notes, when they can be edited; null for a transcript (details only). */
  notes: string | null; edited: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [type, setType] = useState<CallKind>(kind);
  const today = new Date().toISOString().slice(0, 10);

  function close() { setOpen(false); setError(null); setType(kind); }

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await saveCallDetails(fd);
      if (r.error) { setError(r.error); toast(r.error, "bad"); return; }
      toast(r.note ? `Saved. ${r.note}` : "Saved");
      setOpen(false);
      router.refresh();
    });
  };

  const header = (
    <div className="row-between">
      <h2 style={{ margin: 0 }}>{notes !== null ? (kind === "in_person" ? "Meeting notes" : "Your notes") : "Details"}</h2>
      {!open && <button type="button" className="secondary" onClick={() => setOpen(true)}><Pencil size={14} aria-hidden /> {notes !== null ? "Edit notes" : "Edit details"}</button>}
    </div>
  );

  if (!open) {
    if (notes === null) return <div className="row-between muted"><span>Wrong title, date or type? You can change them.</span><button type="button" className="secondary" onClick={() => setOpen(true)}><Pencil size={14} aria-hidden /> Edit details</button></div>;
    return (
      <section className="card">
        {header}
        <pre className="script-box" style={{ marginTop: 12, maxHeight: 420 }}>{notes}</pre>
        <p className="muted" style={{ margin: "10px 0 0" }}>
          {edited ? "Edited since it was first saved. " : ""}Email addresses and phone numbers are masked when notes are saved. Only business notes here, never details about the client&apos;s own customers.
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      {header}
      <form onSubmit={onSubmit} className="stack" style={{ gap: 14, marginTop: 12 }}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="kind" value={type} />
        <div className="row">
          <label className="stack" style={{ gap: 4, flex: 1, minWidth: 220 }}><span className="field-label">Title</span><input name="title" defaultValue={title} maxLength={200} required /></label>
          <label className="stack" style={{ gap: 4 }}><span className="field-label">Date</span><input name="occurred_on" type="date" defaultValue={day} max={today} required /></label>
        </div>
        <div className="stack" style={{ gap: 4 }}>
          <span className="field-label">Type</span>
          <div className="seg" role="tablist" aria-label="Type">
            {CALL_KINDS.map((k) => <button key={k} type="button" role="tab" aria-selected={type === k} onClick={() => setType(k)}>{KIND_LABEL[k]}</button>)}
          </div>
        </div>
        {notes !== null && (
          <label className="stack" style={{ gap: 4 }}>
            <span className="field-label">Notes</span>
            <textarea name="notes" rows={12} defaultValue={notes} required />
            <span className="muted">Saving does not re-run the AI analysis. If this call was analysed, you can analyse it again afterwards.</span>
          </label>
        )}
        {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
        <div className="row">
          <button disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          <button type="button" className="secondary" onClick={close} disabled={pending}>Cancel</button>
        </div>
      </form>
    </section>
  );
}
