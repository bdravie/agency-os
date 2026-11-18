"use client";

import { useRef } from "react";
import { cancelMeeting } from "@/lib/meetingActions";
import { useConfirm } from "./ConfirmDialog";

// Cancelling reaches the guest (Google emails them), so it asks in the CRM's own confirmation, naming who and when,
// like booking does. The dialog sits beside the form, never inside it.
export default function CancelMeetingButton({ id, title, who, email, when }: { id: number; title: string; who: string; email: string; when: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [confirmCancel, confirmDialog] = useConfirm();
  const ask = async () => {
    const yes = await confirmCancel({
      title: `Cancel the meeting with ${who}?`,
      details: [["Meeting", title], ["When", when], ["Guest", email]],
      body: "Google emails them that it is cancelled as soon as you confirm.",
      confirmLabel: "Cancel meeting",
      cancelLabel: "Keep it",
    });
    if (yes) form.current?.requestSubmit();
  };
  return (
    <>
      <form ref={form} action={cancelMeeting}>
        <input type="hidden" name="id" value={id} />
        <button type="button" className="secondary danger" onClick={() => void ask()}>Cancel</button>
      </form>
      {confirmDialog}
    </>
  );
}
