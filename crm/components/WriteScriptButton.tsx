"use client";

import { useRouter } from "next/navigation";
import ActionForm from "./ActionForm";
import ScriptSyncInput from "./ScriptSyncInput";
import { writeScriptAction } from "@/lib/actions";

export default function WriteScriptButton({
  id,
  hasScript,
  hasRawNotes,
}: {
  id: number;
  hasScript: boolean;
  hasRawNotes: boolean;
}) {
  const router = useRouter();

  return (
    <ActionForm
      action={writeScriptAction}
      label={hasScript ? "Rewrite script" : "Write script"}
      busyLabel="Writing… (about 15 seconds)"
      onDone={() => router.refresh()}
      confirm={
        hasScript && !hasRawNotes
          ? "This will polish your current draft or notes into a new scripted version. Carry on?"
          : undefined
      }
    >
      <input type="hidden" name="id" value={id} />
      <ScriptSyncInput targetTextareaId="script" />
    </ActionForm>
  );
}
