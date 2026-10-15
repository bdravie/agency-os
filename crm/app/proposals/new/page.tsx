"use client";

import { useActionState } from "react";
import { createProposal } from "@/lib/actions";
import { PageHeader } from "@/components/ui";

export default function NewProposal() {
  const [message, action, pending] = useActionState(createProposal, null);
  return (
    <>
      <PageHeader back={{ href: "/proposals", label: "Proposals" }} title="New proposal" description="Paste the whole job post. You'll get a fit score and a draft under 150 words in about 15 seconds." />
      <form action={action} className="card stack" style={{ gap: 12, maxWidth: 760 }}>
        <input name="job_title" placeholder="Job title (optional)" aria-label="Job title" />
        <input name="job_url" placeholder="Job URL (optional)" aria-label="Job URL" />
        <textarea name="job_text" rows={14} placeholder="Paste the full Upwork job post here" aria-label="Job post" required autoFocus />
        <label className="muted"><input type="checkbox" name="force" /> Draft anyway if the fit score is below 6</label>
        <button disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Scoring and drafting… (about 15 seconds)" : "Draft proposal"}</button>
        {message && <p className="error" role="alert">{message}</p>}
      </form>
    </>
  );
}
