"use client";

import { useState, useTransition } from "react";
import { archiveProposals, deleteProposals } from "@/lib/proposalActions";
import { ARCHIVE_REASONS, DELETION_CATEGORIES, NOTE_MAX, NOTE_MIN, deletionProblem } from "@/lib/proposalStatus";

// Archive ("not pursuing") and delete dialogs, used for one proposal or a ticked selection. Archive is reversible and the reason is optional.
// Delete is permanent: it needs a category and a written note, which go in the deletion log.

type Target = { ids: number[]; label: string };

export function ArchiveDialog({ target, onClose, onDone }: { target: Target; onClose: () => void; onDone: (n: number) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const many = target.ids.length > 1;
  const submit = () => start(async () => {
    const r = await archiveProposals(target.ids, reason || undefined);
    if ("error" in r) { setError(r.error); return; }
    onDone(r.done);
  });
  return (
    <div className="palette-wrap" role="dialog" aria-modal="true" aria-label="Archive proposals" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="card stack dialog" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <h2 style={{ margin: 0 }}>Archive {many ? `${target.ids.length} proposals` : "this proposal"}?</h2>
        <p className="muted">{target.label}. {many ? "They leave" : "It leaves"} the pipeline but {many ? "are" : "is"} kept. Show archived brings {many ? "them" : "it"} back, and Restore puts {many ? "them" : "it"} in the pipeline again.</p>
        <div className="pills" role="radiogroup" aria-label="Reason (optional)">
          {ARCHIVE_REASONS.map((r) => (
            <button key={r.code} type="button" role="radio" aria-checked={reason === r.code} className={`pill${reason === r.code ? " on" : ""}`} onClick={() => setReason(reason === r.code ? "" : r.code)}>{r.label}</button>
          ))}
        </div>
        <p className="muted" style={{ margin: 0 }}>A reason is optional.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row">
          <button disabled={pending} autoFocus>{pending ? "Archiving…" : "Archive"}</button>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

export function DeleteDialog({ target, sentCount = 0, onClose, onDone }: { target: Target; sentCount?: number; onClose: () => void; onDone: (deleted: number, skipped: string[]) => void }) {
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const many = target.ids.length > 1;
  const submit = () => {
    const problem = deletionProblem(category, note);
    if (problem) { setError(problem); return; }
    start(async () => {
      const r = await deleteProposals(target.ids, category, note);
      if ("error" in r) { setError(r.error); return; }
      onDone(r.deleted, r.skipped);
    });
  };
  return (
    <div className="palette-wrap" role="dialog" aria-modal="true" aria-label="Delete proposals" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="card stack dialog" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <h2 style={{ margin: 0 }}>Delete {many ? `${target.ids.length} proposals` : "this proposal"} for good?</h2>
        <p className="muted">{target.label}. This can't be undone; the reason is kept in the deletion log. To keep {many ? "them" : "it"} out of the way without losing {many ? "them" : "it"}, archive instead.</p>
        {sentCount > 0 && <p className="muted" style={{ color: "var(--warn)" }}>{sentCount === 1 ? "One of these was" : `${sentCount} of these were`} sent on Upwork. Deleting {sentCount === 1 ? "it removes it" : "them removes them"} from the Loom against plain comparison.</p>}
        <div className="pills" role="radiogroup" aria-label="Reason">
          {DELETION_CATEGORIES.map((c) => (
            <button key={c.code} type="button" role="radio" aria-checked={category === c.code} className={`pill${category === c.code ? " on" : ""}`} title={c.hint} onClick={() => setCategory(c.code)}>{c.label}</button>
          ))}
        </div>
        <p className="muted" style={{ margin: 0 }}>{DELETION_CATEGORIES.find((c) => c.code === category)?.hint ?? "Why is this being deleted?"}</p>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={NOTE_MAX} autoFocus aria-label="Note" placeholder={`What happened? (at least ${NOTE_MIN} characters)`} />
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row">
          <button disabled={pending}>{pending ? "Deleting…" : many ? `Delete ${target.ids.length} proposals` : "Delete proposal"}</button>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
