"use client";

import { useMemo, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import "@/app/proposals/build-plan.css";
import { addLibraryWorkflowAction } from "@/lib/buildPlanActions";
import { MAX_FILE_CHARS, parseWorkflowText, plainStep } from "@/lib/workflowParse";
import { useToast } from "@/components/Toast";

const field = (label: string, input: React.ReactNode) => <label className="stack" style={{ gap: 4 }}><span className="field-label" style={{ marginBottom: 0 }}>{label}</span>{input}</label>;

// Adds one of the owner's own workflows to the library. The file is read here in the browser and only its outline is sent:
// step names, apps and how the steps connect. The file's settings (webhook addresses, credential names, message text) never leave the page.
export default function WorkflowUpload() {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [raw, setRaw] = useState("");
  const [name, setName] = useState("");
  const [solves, setSolves] = useState("");
  const [tags, setTags] = useState("");
  const read = useMemo(() => (raw.trim() ? parseWorkflowText(raw) : null), [raw]);
  const w = read?.workflow;
  const load = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_CHARS) { toast("That file is too large to read here (over 1.5 MB).", "bad"); return; }
    setRaw(await file.text());
  };
  const add = () => start(async () => {
    const form = new FormData();
    form.set("outline", JSON.stringify(w)); form.set("name", name || w?.name || ""); form.set("solves", solves); form.set("tags", tags);
    const r = await addLibraryWorkflowAction(form);
    if (r.error) { toast(r.error, "bad"); return; }
    toast("Workflow added to your library");
    setRaw(""); setName(""); setSolves(""); setTags("");
  });
  return (
    <div className="lp-item">
      <b>Add a workflow</b>
      <div className="bp-file">
        <input type="file" accept=".json,application/json" aria-label="Choose an n8n workflow file or a Make blueprint" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />
        <span className="muted">An n8n workflow (Download) or a Make blueprint (Export blueprint). Read in your browser: only the outline is saved, never the file or its settings.</span>
      </div>
      <textarea rows={2} value={raw.length > 2000 ? `${raw.slice(0, 2000)}…` : raw} readOnly={raw.length > 2000} onChange={(e) => setRaw(e.target.value)} placeholder="Or paste the workflow's JSON here" aria-label="Workflow JSON" className="bp-mono" spellCheck={false} />
      {read?.error && <p className="error" role="alert">{read.error}</p>}
      {w && (
        <>
          <p style={{ margin: 0 }}><span className="badge tone-neutral">{w.platform === "make" ? "Make" : "n8n"}</span> {w.steps.length} steps{w.dropped ? ` (${w.dropped} more left out)` : ""}{w.apps.length ? ` · ${w.apps.join(", ")}` : ""}</p>
          <ol className="bp-outline">{w.steps.slice(0, 8).map((s) => <li key={s.id}>{plainStep(s)}</li>)}{w.steps.length > 8 && <li className="muted">and {w.steps.length - 8} more</li>}</ol>
          <div className="grid">
            {field("Name", <input value={name} placeholder={w.name || "What you call it"} maxLength={120} onChange={(e) => setName(e.target.value)} />)}
            {field("Tags (commas)", <input value={tags} placeholder="invoices, reminders" onChange={(e) => setTags(e.target.value)} />)}
          </div>
          {field("The problem it solves, in a line (this is what the search matches on)", <input value={solves} maxLength={300} onChange={(e) => setSolves(e.target.value)} />)}
          <div><button type="button" className="secondary" disabled={pending || !(name || w.name)} onClick={add}><Upload size={14} aria-hidden /> {pending ? "Adding…" : "Add to my library"}</button></div>
        </>
      )}
    </div>
  );
}
