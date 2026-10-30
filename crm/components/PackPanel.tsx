"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { generatePackAction } from "@/lib/actions";
import type { Pack } from "@/lib/upworkPack";
import CopyButton from "./CopyButton";

const loomText = (l: Pack["loom"]) =>
  [`HOOK: ${l.hook}`, ...l.show.map((b, i) => `${i + 1}. SAY: ${b.say}\n   ON SCREEN: ${b.on_screen}`), `CLOSE: ${l.close}`].join("\n\n");

export default function PackPanel({ id, pack, packAt }: { id: number; pack: Pack | null; packAt: string | null }) {
  const [message, action, pending] = useActionState(generatePackAction, null);
  return (
    <section className="card stack" style={{ gap: 12, marginTop: 16 }} aria-labelledby="pack-h">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 id="pack-h">Pitch pack</h2>
          <p className="muted">Cover letter, a Loom script written for this job and a workflow diagram. Runs only when you click. You copy and send everything yourself.</p>
        </div>
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <button disabled={pending}><Sparkles size={15} aria-hidden /> {pending ? "Writing… (about 30 seconds)" : pack ? "Write it again" : "Write pitch pack"}</button>
        </form>
      </div>
      {message && <p className="error" role="alert">{message}</p>}
      {pack && (
        <>
          {pack.data_note && <p className="response-box"><b>Data processing agreement first:</b> {pack.data_note}</p>}
          <p className="muted">Main thing to check with this client: {pack.fit_note}{packAt ? ` · written ${new Date(packAt).toLocaleString("en-GB")}` : ""}</p>

          <div className="stack" style={{ gap: 6 }}>
            <h3>1. Cover letter (paste into the proposal)</h3>
            <textarea id="pack-cover" readOnly rows={16} defaultValue={pack.cover_letter} aria-label="Cover letter" />
            <div><CopyButton targetId="pack-cover" label="Copy cover letter" /></div>
          </div>

          <div className="stack" style={{ gap: 6 }}>
            <h3>2. Loom script (about 90 seconds)</h3>
            {pack.loom.prep.length > 0 && <p className="muted">Before you record: {pack.loom.prep.join(" · ")}</p>}
            <textarea id="pack-loom" readOnly rows={14} defaultValue={loomText(pack.loom)} aria-label="Loom script" />
            <div><CopyButton targetId="pack-loom" label="Copy Loom script" /></div>
          </div>

          <div className="stack" style={{ gap: 6 }}>
            <h3>3. Workflow diagram (Mermaid)</h3>
            <p className="muted">Paste into mermaid.live to get a picture you can screenshot and attach.</p>
            <textarea id="pack-diagram" readOnly rows={8} defaultValue={pack.diagram} aria-label="Mermaid diagram" />
            <div className="row">
              <CopyButton targetId="pack-diagram" label="Copy diagram code" />
              <a href="https://mermaid.live" target="_blank" rel="noreferrer" className="muted">Open mermaid.live</a>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
