"use client";

import { useState } from "react";
import { addDeliverable } from "@/lib/enablementActions";
import { ALLOWED_EXTENSIONS, MAX_FILES } from "@/lib/enablementMath";
import ToastForm from "./ToastForm";

// Hand over a skill, prompt or template: paste the text and/or attach files (stored in the database, so they're backed up).
export default function DeliverableForm({ companyId, sessions, today }: { companyId: number; sessions: { id: number; title: string; held_on: string }[]; today: string }) {
  const [fresh, setFresh] = useState(0);
  return (
    <ToastForm key={fresh} action={addDeliverable} success="Saved" className="stack" style={{ gap: 10 }} onDone={() => setFresh((n) => n + 1)}>
      <input type="hidden" name="company_id" value={companyId} />
      <div className="row">
        <label className="stack" style={{ gap: 4 }}><span className="field-label">Type</span><select name="kind" defaultValue="prompt"><option value="prompt">Prompt</option><option value="template">Template</option><option value="skill">Skill</option><option value="other">Other</option></select></label>
        <label className="stack" style={{ gap: 4, flex: 1, minWidth: 220 }}><span className="field-label">Title</span><input name="title" maxLength={200} placeholder="e.g. Weekly report prompt pack" required /></label>
        <label className="stack" style={{ gap: 4 }}><span className="field-label">Delivered</span><input type="date" name="delivered_on" defaultValue={today} max={today} required /></label>
      </div>
      <label className="stack" style={{ gap: 4 }}><span className="field-label">What it is for (optional)</span><input name="description" maxLength={600} placeholder="One line on when to use it" /></label>
      <label className="stack" style={{ gap: 4 }}><span className="field-label">Paste the text (optional if you attach a file)</span><textarea name="body" rows={5} maxLength={20000} placeholder="The prompt, skill instructions or template wording." /></label>
      <label className="stack" style={{ gap: 4 }}><span className="field-label">Files (optional)</span><input type="file" name="files" multiple accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")} /></label>
      {sessions.length > 0 && (
        <label className="stack" style={{ gap: 4, alignSelf: "flex-start" }}><span className="field-label">Handed over in a session? (optional)</span>
          <select name="session_id" defaultValue=""><option value="">No particular session</option>{sessions.map((s) => <option key={s.id} value={s.id}>{s.held_on} · {s.title}</option>)}</select>
        </label>
      )}
      <p className="muted" style={{ margin: 0 }}>Up to {MAX_FILES} files, 3 MB each: pdf, docx, xlsx, pptx, txt, md, csv, json, png or jpg. Don&apos;t include API keys, passwords or any customer&apos;s personal data. Files download only; they are never opened in the page.</p>
      <button className="secondary" style={{ alignSelf: "flex-start" }}>Save</button>
    </ToastForm>
  );
}
