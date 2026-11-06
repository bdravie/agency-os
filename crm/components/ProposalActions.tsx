"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { restoreProposals } from "@/lib/proposalActions";
import { cannotDelete } from "@/lib/proposalStatus";
import { useToast } from "./Toast";
import { ArchiveDialog, DeleteDialog } from "./ProposalDialogs";

// Archive or restore, and delete, for the proposal being viewed. Delete is only offered once the rules allow it.
export default function ProposalActions({ id, title, status, archived }: { id: number; title: string; status: string; archived: boolean }) {
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const blocked = cannotDelete({ status, archived_at: archived ? "x" : null });
  const target = { ids: [id], label: title };
  return (
    <div className="row">
      {archived
        ? <button type="button" className="secondary" onClick={() => start(async () => { const r = await restoreProposals([id]); if ("error" in r) toast(r.error, "bad"); else { toast("Proposal restored"); router.refresh(); } })}><ArchiveRestore size={15} aria-hidden /> Restore</button>
        : <button type="button" className="secondary" onClick={() => setArchiving(true)}><Archive size={15} aria-hidden /> Archive</button>}
      <button type="button" className="secondary danger" disabled={!!blocked} title={blocked ?? "Delete for good"} onClick={() => setDeleting(true)}><Trash2 size={15} aria-hidden /> Delete</button>
      {archiving && <ArchiveDialog target={target} onClose={() => setArchiving(false)} onDone={() => { setArchiving(false); toast("Proposal archived"); router.push("/proposals"); router.refresh(); }} />}
      {deleting && <DeleteDialog target={target} sentCount={status === "Draft" ? 0 : 1} onClose={() => setDeleting(false)} onDone={(n, skipped) => { setDeleting(false); if (n === 0) { toast(skipped.join(" ") || "Nothing was deleted", "bad"); return; } toast("Proposal deleted. The reason is in the deletion log."); router.push("/proposals"); router.refresh(); }} />}
    </div>
  );
}
