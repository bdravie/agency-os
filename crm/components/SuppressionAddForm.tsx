"use client";

import { useActionState } from "react";
import { addSuppressionAction, type SuppressionState } from "@/lib/complianceActions";

export default function SuppressionAddForm() {
  const [state, action, pending] = useActionState<SuppressionState, FormData>(addSuppressionAction, null);
  return (
    <form action={action} className="stack" style={{ gap: 10, maxWidth: 640 }}>
      <label className="stack" style={{ gap: 4 }}><span className="field-label">Emails, websites, phone numbers or company numbers (one per line)</span>
        <textarea name="entries" rows={4} placeholder={"info@example.com\nexample.co.uk\n07700 900123\n01234567"} required />
      </label>
      <label className="stack" style={{ gap: 4 }}><span className="field-label">Reason (optional)</span><input name="reason" maxLength={200} placeholder="e.g. Replied “remove me”" /></label>
      <button disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Adding…" : "Add to the suppression list"}</button>
      {state?.ok && <p role="status" style={{ margin: 0, color: "var(--good)" }}>{state.ok}</p>}
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      {state?.rejected && state.rejected.length > 0 && <p className="muted" style={{ margin: 0 }}>Not recognised, so skipped: {state.rejected.join(" · ")}</p>}
    </form>
  );
}
