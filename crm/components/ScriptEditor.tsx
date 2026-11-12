"use client";

import { saveContent } from "@/lib/actions";
import ToastForm from "./ToastForm";

type Fields = { id: number; hook: string | null; hook_alt: string | null; script: string | null; caption: string | null; keyword: string | null; status: string };

const wide = { width: "100%" };

// Write or change a script by hand in the content quick view. Saves the same fields the AI fills in, and a waiting idea moves to Script ready.
export default function ScriptEditor({ item, onSaved, onCancel, onDirty }: { item: Fields; onSaved: () => void; onCancel: () => void; onDirty: () => void }) {
  return (
    <section onChange={onDirty}>
      <ToastForm action={saveContent} success="Script saved" onDone={onSaved} className="stack" style={{ gap: 10 }}>
        <input type="hidden" name="id" value={item.id} />
        <label><span className="field-label">Hook</span><input name="hook" style={wide} defaultValue={item.hook ?? ""} placeholder="The first line of the video" /></label>
        <label><span className="field-label">Alternative hook (B), optional</span><input name="hook_alt" style={wide} defaultValue={item.hook_alt ?? ""} placeholder="A different opening to test against the first" /></label>
        <label>
          <span className="field-label">Script</span>
          <textarea id="drawer-script" name="script" rows={14} required autoFocus defaultValue={item.script ?? ""} placeholder="Write what you will say. Filming day shows it on the teleprompter as you type it here." />
          {/^\s*SCRIPT\s*$/im.test(item.script ?? "") && <span className="muted" style={{ display: "block", marginTop: 4 }}>Filming day reads what is under the SCRIPT heading. Keep the headings, or delete them all to read the whole text.</span>}
        </label>
        <label><span className="field-label">Caption, optional</span><textarea name="caption" rows={3} defaultValue={item.caption ?? ""} /></label>
        <label><span className="field-label">Comment keyword, optional</span><input name="keyword" style={wide} defaultValue={item.keyword ?? ""} /></label>
        {item.status === "Idea" && <p className="muted" style={{ margin: 0 }}>Saving moves this idea to Script ready, so it shows on Filming day.</p>}
        <div className="row"><button>Save script</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></div>
      </ToastForm>
    </section>
  );
}
