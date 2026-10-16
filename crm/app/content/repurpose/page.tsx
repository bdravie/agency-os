import { repurposeAction } from "@/lib/actions";
import ActionForm from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";

export default function Repurpose() {
  return (
    <>
      <PageHeader back={{ href: "/content", label: "Content" }} title="Repurpose a transcript" description="One long transcript becomes 3 short-video scripts, 3 LinkedIn posts and 1 newsletter, added to the board as Scripted." />
      <div className="card" style={{ maxWidth: 760 }}>
        <ActionForm action={repurposeAction} label="Repurpose" busyLabel="Working… (about 40 seconds)">
          <textarea name="transcript" rows={16} placeholder="Paste the transcript here" aria-label="Transcript" required />
        </ActionForm>
      </div>
    </>
  );
}
