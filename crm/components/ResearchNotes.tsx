"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveResearchNotesAction } from "@/lib/researchNotesActions";
import { checkResearchNotes, NOTES_MAX_CHARS } from "@/lib/researchNotes";
import { useToast } from "./Toast";

// Things the owner noticed about the business themselves. The AI offer suggestions read and cite these alongside the website research.
export default function ResearchNotes({ companyId, initial, changedSinceDraft }: { companyId: number; initial: string; changedSinceDraft: boolean }) {
  const toast = useToast(), router = useRouter();
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const check = useMemo(() => checkResearchNotes(text), [text]);
  const dirty = text !== saved;
  const id = `research-notes-${companyId}`;

  const save = () => start(async () => {
    const r = await saveResearchNotesAction(companyId, text);
    if (r.error) { toast(r.error, "bad"); return; }
    const clean = checkResearchNotes(text).notes;
    setText(clean); setSaved(clean);
    toast(clean ? "Research notes saved" : "Research notes cleared");
    router.refresh();
  });

  return (
    <div className="stack" style={{ gap: 6, marginBottom: 14 }}>
      <label htmlFor={id} className="field-label">Your research notes</label>
      <textarea id={id} rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-describedby={`${id}-help`}
        placeholder={"One thing per line, for example:\nPhone went to voicemail twice during office hours\nBooking form asks them to email for a quote"} />
      <p id={`${id}-help`} className={check.error ? "error" : "muted"} role={check.error ? "alert" : undefined} style={{ margin: 0 }}>
        {check.error ?? `Used the next time the AI drafts offer ideas, and shown as "Your note" when an idea relies on one. About the business only: no customers' details, emails or phone numbers. ${check.notes.length}/${NOTES_MAX_CHARS}`}
      </p>
      {changedSinceDraft && !dirty && <p role="status" className="muted" style={{ margin: 0, color: "var(--warn)" }}>You changed these notes after the ideas below were drafted, so the ideas don&apos;t reflect them yet.</p>}
      <div className="row"><button type="button" className="secondary" disabled={pending || !dirty || !!check.error} onClick={save}>{pending ? "Saving…" : "Save notes"}</button></div>
    </div>
  );
}
