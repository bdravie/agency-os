"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteDeal } from "@/lib/actions";
import { DELETION_CATEGORIES, NOTE_MAX, NOTE_MIN, deletionProblem } from "@/lib/dealDeletion";
import { useToast } from "./Toast";

// Removing a deal needs a reason category and a written note, which are kept in the deletion log.
export default function DeleteDealButton({ dealId, title, stage, onDeleted }: { dealId: number; title: string; stage: string; onDeleted?: () => void }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const close = () => { setOpen(false); setError(null); };

  if (stage === "Won") return <p className="muted">A won deal is a client, so it can't be deleted here.</p>;
  const submit = () => {
    const problem = deletionProblem(category, note);
    if (problem) { setError(problem); return; }
    start(async () => {
      const err = await deleteDeal(dealId, category, note);
      if (err) { setError(err); return; }
      toast("Deal removed. The reason is in the deletion log.");
      close();
      onDeleted?.();
      router.push("/deals");
      router.refresh();
    });
  };
  return (
    <>
      <button type="button" className="secondary danger" onClick={() => setOpen(true)}><Trash2 size={15} aria-hidden /> Delete deal</button>
      {open && (
        <div className="palette-wrap" role="dialog" aria-modal="true" aria-label="Why is this deal being deleted?" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <form className="card stack dialog" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <h2 style={{ margin: 0 }}>Why is this deal being deleted?</h2>
            <p className="muted">{title}. It leaves the pipeline for good; the reason is kept in the deletion log.</p>
            <div className="pills" role="radiogroup" aria-label="Reason">
              {DELETION_CATEGORIES.map((c) => (
                <button key={c.code} type="button" role="radio" aria-checked={category === c.code} className={`pill${category === c.code ? " on" : ""}`} title={c.hint} onClick={() => setCategory(c.code)}>{c.label}</button>
              ))}
            </div>
            <p className="muted" style={{ margin: 0 }}>{DELETION_CATEGORIES.find((c) => c.code === category)?.hint ?? "Admin mistake, or a lead that was wasted?"}</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={NOTE_MAX} autoFocus aria-label="Note" placeholder={`What happened? (at least ${NOTE_MIN} characters)`} />
            {error && <p className="error" role="alert">{error}</p>}
            <div className="row">
              <button disabled={pending}>{pending ? "Deleting…" : "Delete deal"}</button>
              <button type="button" className="secondary" onClick={close}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
