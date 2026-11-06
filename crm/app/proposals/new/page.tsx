"use client";

import { useActionState, useState } from "react";
import { createProposal } from "@/lib/actions";
import { createLoomPitch } from "@/lib/loomPitchActions";
import { PageHeader } from "@/components/ui";

const MODES = {
  plain: { label: "Plain proposal", intro: "Paste the whole job post. You'll get a fit score and a draft under 150 words in about 15 seconds." },
  loom: { label: "Loom pitch", intro: "For custom jobs. Paste the job post and you'll get everything to record a 3 to 4 minute Loom, plus a very short cover letter. Takes about a minute." },
} as const;

export default function NewProposal() {
  const [mode, setMode] = useState<keyof typeof MODES>("plain");
  const [plainMessage, plainAction, plainPending] = useActionState(createProposal, null);
  const [loomMessage, loomAction, loomPending] = useActionState(createLoomPitch, null);
  const pending = plainPending || loomPending, message = mode === "loom" ? loomMessage : plainMessage;
  return (
    <>
      <PageHeader back={{ href: "/proposals", label: "Proposals" }} title="New proposal" description={MODES[mode].intro} />
      <form action={mode === "loom" ? loomAction : plainAction} className="card stack" style={{ gap: 12, maxWidth: 760 }}>
        <div className="pills" role="radiogroup" aria-label="Mode">
          {(Object.keys(MODES) as (keyof typeof MODES)[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={`pill${mode === m ? " on" : ""}`} onClick={() => setMode(m)}>{MODES[m].label}</button>
          ))}
        </div>
        <input name="job_title" placeholder="Job title (optional, taken from the first line of the post if empty)" aria-label="Job title" />
        <input name="company_name" placeholder="Company name (optional)" aria-label="Company name" />
        <input name="job_url" placeholder="Job URL (optional)" aria-label="Job URL" />
        <textarea name="job_text" rows={14} placeholder="Paste the full Upwork job post here" aria-label="Job post" required autoFocus />
        {mode === "loom" && (
          <>
            <input name="budget" placeholder="Budget or rate, if it isn't in the post (optional)" aria-label="Budget or rate" />
            <input name="client_name" placeholder="Client's first name, if you can see it (optional)" aria-label="Client's first name" />
            <textarea name="screening_questions" rows={4} placeholder="Screening questions, one per line (optional)" aria-label="Screening questions" />
            <textarea name="client_info" rows={3} placeholder="What you can see about the client: tools they use, how many jobs they've posted, hire history (optional)" aria-label="Client info" />
          </>
        )}
        <label className="muted"><input type="checkbox" name="force" /> Draft anyway if the fit score is below 6</label>
        <button disabled={pending} style={{ alignSelf: "flex-start" }}>
          {mode === "loom" ? (pending ? "Writing your Loom pitch… (about a minute)" : "Write Loom pitch") : (pending ? "Scoring and drafting… (about 15 seconds)" : "Draft proposal")}
        </button>
        {message && <p className="error" role="alert">{message}</p>}
      </form>
    </>
  );
}
