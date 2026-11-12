"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Hammer } from "lucide-react";
import { demoBriefAction } from "@/lib/actions";
import CopyButton from "@/components/CopyButton";
import type { DemoBrief } from "@/lib/demoBriefMath";

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const kindLabel = { tool: "Tool not used yet", work: "Work not done yet" } as const;

export default function DemoBriefPanel({ id, brief, prompt, at, hourly }: { id: number; brief: DemoBrief | null; prompt: string; at: string | null; hourly: number }) {
  const [message, action, pending] = useActionState(demoBriefAction, null);
  const d = brief?.demo ?? null;
  return (
    <section className="card stack" style={{ gap: 12 }} aria-labelledby="demo-h">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 id="demo-h">Demo brief</h2>
          <p className="muted">Finds what this job needs that you have nothing to show for yet, and writes a brief for Claude Code to build one small demo of it. Reads your About me, portfolio, tools and proof. Runs only when you click; nothing is built or sent from here.</p>
        </div>
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <button className={brief ? "secondary" : undefined} disabled={pending}><Hammer size={15} aria-hidden /> {pending ? "Thinking… (about 20 seconds)" : brief ? "Write it again" : "Write demo brief"}</button>
        </form>
      </div>
      {message && <p className="error" role="alert">{message}</p>}
      {brief && (
        <>
          {brief.gaps.length === 0 ? (
            <div className="response-box" style={{ marginTop: 0 }}>
              <p><span className="badge tone-good">Nothing new to build</span></p>
              <p style={{ marginTop: 6 }}>Everything this job asks for is already backed by something you have. Show that instead.</p>
            </div>
          ) : (
            <>
              <h3>Nothing to show for yet</h3>
              <ul className="fx-list">
                {brief.gaps.map((g, i) => (
                  <li key={i} style={{ alignItems: "flex-start" }}>
                    <span className="badge tone-warn">{kindLabel[g.kind]}</span>
                    <span style={{ flex: 1 }}><b>{g.what}</b>{d?.shows.includes(g.what) && <> <span className="badge tone-good">In the demo</span></>}{g.why && <><br />{g.why}</>}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {brief.covered.length > 0 && (
            <>
              <h3>Already covered</h3>
              <ul>{brief.covered.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </>
          )}
          {d && (
            <>
              <div className="response-box" style={{ marginTop: 0 }}>
                <p><b>{d.title}</b> <span className="muted">· demos/{d.slug}/</span></p>
                <p style={{ marginTop: 6 }}>{d.outcome}</p>
                <p className="muted" style={{ marginTop: 6 }}>About {d.hours}h to build (≈ {gbp(Math.round(d.hours * hourly))} of your time at {gbp(hourly)}/hour){d.tools.length ? ` · ${d.tools.join(", ")}` : ""}. A guess, not a promise.</p>
                {brief.data_note && <p style={{ marginTop: 6 }}><span className="badge tone-warn">Personal data</span> {brief.data_note}</p>}
              </div>
              <label className="field-label" htmlFor="demo-brief-text">Brief for Claude Code (changes here are copied but not saved)</label>
              <textarea id="demo-brief-text" rows={18} defaultValue={prompt} key={prompt} />
              <div className="row">
                <CopyButton targetId="demo-brief-text" label="Copy brief for Claude" />
              </div>
              <p className="muted">Paste it into Claude Code in this project and it builds the demo in demos/{d.slug}/. Show it to the client as a demo you built for this job, never as client work. Once it runs, add it under <Link href="/proposals/library">Proof and answers</Link> as a demo so your pitches can mention it{at ? ` · written ${new Date(at).toLocaleString("en-GB")}` : ""}.</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
