"use client";

import { useActionState, useState } from "react";
import { Sparkles } from "lucide-react";
import { createCall } from "@/lib/callActions";
import { CALL_KINDS, KIND_LABEL, defaultTitle, type CallKind } from "@/lib/callEdit";

// Log a call or in-person meeting against a deal or company: upload a .vtt/.srt/.txt, paste a transcript, or paste your own notes.
// "Save" is free. "Save and analyse" uses Claude credits, so it is a separate, labelled button.
export default function CallUploadForm({ companyId, dealId, companyName, model, usage }: {
  companyId: number; dealId: number | null; companyName: string; model: string; usage: { used: number; cap: number };
}) {
  const [error, action, pending] = useActionState(createCall, null);
  const [mode, setMode] = useState<"upload" | "paste" | "notes">("upload");
  const [kind, setKind] = useState<CallKind>("call");
  const [title, setTitle] = useState(defaultTitle("call", companyName));
  const [titleEdited, setTitleEdited] = useState(false);
  // An in-person meeting has no recording to upload, so it starts on notes. The suggested title follows the type until you type your own.
  const pickKind = (k: CallKind) => {
    setKind(k);
    if (k === "in_person") setMode("notes");
    if (!titleEdited) setTitle(defaultTitle(k, companyName));
  };
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="card stack" style={{ gap: 14, maxWidth: 820 }}>
      <input type="hidden" name="company_id" value={companyId} />
      {dealId && <input type="hidden" name="deal_id" value={dealId} />}
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="kind" value={kind} />
      <div className="stack" style={{ gap: 4 }}>
        <span className="field-label">What was it?</span>
        <div className="seg" role="tablist" aria-label="Type">
          {CALL_KINDS.map((k) => <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => pickKind(k)}>{KIND_LABEL[k]}</button>)}
        </div>
      </div>
      <div className="row">
        <label className="stack" style={{ gap: 4, flex: 1, minWidth: 220 }}><span className="field-label">Title</span><input name="title" value={title} onChange={(e) => { setTitle(e.target.value); setTitleEdited(true); }} maxLength={200} /></label>
        <label className="stack" style={{ gap: 4 }}><span className="field-label">Date</span><input name="occurred_on" type="date" defaultValue={today} max={today} /></label>
      </div>

      <div className="seg" role="tablist" aria-label="How to add it">
        <button type="button" role="tab" aria-selected={mode === "upload"} onClick={() => setMode("upload")}>Upload a file</button>
        <button type="button" role="tab" aria-selected={mode === "paste"} onClick={() => setMode("paste")}>Paste a transcript</button>
        <button type="button" role="tab" aria-selected={mode === "notes"} onClick={() => setMode("notes")}>Paste my notes</button>
      </div>

      {mode === "upload" && (
        <div className="stack" style={{ gap: 6 }}>
          <input type="file" name="file" accept=".vtt,.srt,.txt,text/plain,text/vtt" aria-label="Transcript file" />
          <p className="muted" style={{ margin: 0 }}>A .vtt or .srt from Zoom, Meet or Teams, or a plain .txt. Up to 2 MB.</p>
        </div>
      )}
      {mode === "paste" && <textarea name="text" rows={14} placeholder="Paste the transcript here" aria-label="Transcript" />}
      {mode === "notes" && <textarea name="text" rows={10} placeholder={kind === "in_person" ? "Your notes from the meeting: what they said, what worries them, what you agreed. You can come back and edit these." : "Your notes from the call: what they said, what worries them, what you agreed."} aria-label="Notes" />}

      {mode !== "notes" && (
        <label className="row muted" style={{ flexDirection: "row", gap: 8 }}>
          <input type="checkbox" name="anonymise" defaultChecked /> Replace speaker names with &ldquo;Me&rdquo; and &ldquo;Prospect&rdquo; (recommended)
        </label>
      )}
      <p className="muted" style={{ margin: 0 }}>
        Before saving, email addresses and phone numbers are masked and the original file is not kept. Only add transcripts of calls or meetings where everyone knew they were being recorded. Your own notes can be edited after saving.
      </p>

      {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div className="row">
        <button name="intent" value="save" className="secondary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        <button name="intent" value="analyse" disabled={pending || usage.used >= usage.cap}><Sparkles size={15} aria-hidden /> {pending ? "Working… (about 20 seconds)" : "Save and analyse with AI"}</button>
        <span className="muted">Analysis uses Claude credits: one call to <code>{model}</code> · {usage.used} of {usage.cap} used today.</span>
      </div>
    </form>
  );
}
