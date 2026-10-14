"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createProposal } from "@/lib/actions";

export default function NewProposal() {
  const [message, action, pending] = useActionState(createProposal, null);
  return (
    <>
      <p><Link href="/proposals">← Proposals</Link></p>
      <h1>New proposal</h1>
      <form action={action} className="card" style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 760 }}>
        <input name="job_title" placeholder="Job title (optional)" />
        <input name="job_url" placeholder="Job URL (optional)" />
        <textarea name="job_text" rows={14} placeholder="Paste the full Upwork job post here" required autoFocus />
        <label className="muted"><input type="checkbox" name="force" /> Draft anyway if the fit score is below 6</label>
        <button disabled={pending}>{pending ? "Scoring and drafting… (about 15 seconds)" : "Draft proposal"}</button>
        {message && <p className="error">{message}</p>}
      </form>
    </>
  );
}
