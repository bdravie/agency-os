import Link from "next/link";
import { repurposeAction } from "@/lib/actions";
import ActionForm from "@/components/ActionForm";

export default function Repurpose() {
  return (
    <>
      <p><Link href="/content">← Content</Link></p>
      <h1>Repurpose a transcript</h1>
      <p className="muted">One long transcript becomes 3 short-video scripts, 3 LinkedIn posts and 1 newsletter, all added to the board as Scripted.</p>
      <div className="card" style={{ maxWidth: 760 }}>
        <ActionForm action={repurposeAction} label="Repurpose" busyLabel="Working… (about 40 seconds)">
          <textarea name="transcript" rows={16} placeholder="Paste the transcript here" required />
        </ActionForm>
      </div>
    </>
  );
}
