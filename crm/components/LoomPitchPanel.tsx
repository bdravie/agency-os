"use client";

import { useActionState, useMemo, useState, useTransition, type ReactNode } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import "@/app/proposals/loom-pitch.css";
import { generateLoomPitchAction, regenerateLoomSectionAction, saveAnswerToBankAction, saveLoomSectionAction, saveLoomUrlAction } from "@/lib/loomPitchActions";
import {
  coverLength, fillLoomLink, scriptToText, walkthroughMismatch, COVER_MAX, COVER_SOFT, SCRIPT_MAX_SECONDS, SCRIPT_MIN_SECONDS, SECTION_LABELS,
  type Beat, type JobAnalysis, type LoomInputs, type LoomPitch, type LoomScript, type ScreeningAnswer, type Section, type WalkStep,
} from "@/lib/loomPitchMath";
import CopyButton from "./CopyButton";
import MermaidView from "./MermaidView";
import { useToast } from "./Toast";

const toLines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const label = (text: string, input: ReactNode) => <label className="stack" style={{ gap: 4 }}><span className="field-label">{text}</span>{input}</label>;
const LEVEL = { strong: { tone: "good", text: "On your strong list" }, familiar: { tone: "warn", text: "On your familiar list" }, not_listed: { tone: "bad", text: "Not on your lists: check before you say it" }, general: null } as const;

function useSection(id: number, section: Section) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const form = (extra: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.set("id", String(id)); fd.set("section", section);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  };
  return {
    pending,
    save: (value: unknown) => start(async () => {
      const r = await saveLoomSectionAction(form({ value: JSON.stringify(value) }));
      toast(r.error ?? `${SECTION_LABELS[section]} saved`, r.error ? "bad" : undefined);
    }),
    regen: () => {
      const also = section === "workflow_diagram" ? " The Loom script is rewritten too, because its walkthrough follows the diagram." : "";
      if (!window.confirm(`Rewrite ${SECTION_LABELS[section]} with AI? This replaces it, including any edits you made.${also}`)) return;
      start(async () => {
        const r = await regenerateLoomSectionAction(form());
        toast(r.error ?? `${SECTION_LABELS[section]} rewritten`, r.error ? "bad" : undefined);
      });
    },
  };
}

function Frame({ id, section, s, intro, children }: { id: number; section: Section; s: ReturnType<typeof useSection>; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="lp-section" id={`lp-${section}`} data-proposal={id}>
      <div className="lp-head">
        <div><h3>{SECTION_LABELS[section]}</h3>{intro && <p className="muted">{intro}</p>}</div>
        <button type="button" className="secondary" disabled={s.pending} onClick={s.regen}><RefreshCw size={14} aria-hidden /> {s.pending ? "Working…" : "Rewrite"}</button>
      </div>
      {children}
    </div>
  );
}

function SaveButton({ s, value }: { s: ReturnType<typeof useSection>; value: unknown }) {
  return <button type="button" className="secondary" disabled={s.pending} onClick={() => s.save(value)}>Save</button>;
}

function Analysis({ id, value }: { id: number; value: JobAnalysis }) {
  const s = useSection(id, "job_analysis");
  const [a, set] = useState(value);
  const lines = (k: "assumptions" | "open_questions" | "missing") => <textarea rows={Math.max(2, a[k].length + 1)} defaultValue={a[k].join("\n")} onChange={(e) => set({ ...a, [k]: toLines(e.target.value) })} />;
  const tools = (k: keyof JobAnalysis["tools"]) => <input defaultValue={a.tools[k].join(", ")} onChange={(e) => set({ ...a, tools: { ...a.tools, [k]: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) } })} />;
  return (
    <Frame id={id} section="job_analysis" s={s}>
      {a.flags.map((f, i) => <p key={i} className="response-box" style={{ background: "var(--warn-soft)", marginTop: 0 }}><b>{f.type === "personal_data" ? "Personal data" : f.type === "vague_scope" ? "Vague scope" : f.type === "budget_mismatch" ? "Budget" : "Flag"}:</b> {f.note}</p>)}
      {a.budget_note && <p className="muted">{a.budget_note}</p>}
      {a.missing.length > 0 && <div className="lp-item">{label("Missing or weak (read this before you record)", lines("missing"))}</div>}
      <div className="lp-fields">
        {label("Their core need, in their words", <textarea rows={2} defaultValue={a.core_need} onChange={(e) => set({ ...a, core_need: e.target.value })} />)}
        {label("What the business actually wants", <textarea rows={2} defaultValue={a.business_outcome} onChange={(e) => set({ ...a, business_outcome: e.target.value })} />)}
        {label("Tools they mentioned that you know well", tools("known_well"))}
        {label("Tools they mentioned that you're less experienced with", tools("less_experienced"))}
        {label("Tools they mentioned that aren't on your lists", tools("unknown"))}
        {label("Assumptions", lines("assumptions"))}
        {label("Open questions (what depends on their setup)", lines("open_questions"))}
      </div>
      <div><SaveButton s={s} value={a} /></div>
    </Frame>
  );
}

function DiagramSection({ id, title, code: saved, steps }: { id: number; title: string; code: string; steps: WalkStep[] }) {
  const s = useSection(id, "workflow_diagram");
  const toast = useToast();
  const [code, setCode] = useState(saved);
  const mismatch = useMemo(() => walkthroughMismatch(code, steps), [code, steps]);
  const open = async () => {
    const res = await fetch("/api/flowcharts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: `Loom: ${title}`.slice(0, 120), code, theme: "auto" }) });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.flowchart) window.open(`/flowcharts/${body.flowchart.id}`, "_blank", "noopener");
    else toast(body.error ?? "Could not open it in Flowcharts.", "bad");
  };
  return (
    <Frame id={id} section="workflow_diagram" s={s} intro="A plan you sketched for them, not a system that exists. This is what you show on screen.">
      <MermaidView code={code} />
      {mismatch.length > 0 && <p className="error" role="alert">The walkthrough no longer matches: {mismatch.join("; ")}.</p>}
      <textarea id="lp-mermaid" rows={Math.min(14, code.split("\n").length + 1)} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Mermaid code" spellCheck={false} style={{ fontFamily: "var(--font-mono, monospace)" }} />
      <div className="row">
        <CopyButton targetId="lp-mermaid" label="Copy Mermaid" />
        <SaveButton s={s} value={{ mermaid: code }} />
        <button type="button" className="secondary" onClick={open}>Open full screen in Flowcharts</button>
      </div>
    </Frame>
  );
}

function BeatEditor({ b, onChange, footer, children }: { b: Beat; onChange: (b: Beat) => void; footer?: ReactNode; children?: ReactNode }) {
  return (
    <div className="lp-beat" id={`lp-beat-${b.key}`}>
      <div className="lp-beat-head">
        <b>{b.label}</b>
        <label className="lp-seconds muted"><span>about</span><input type="number" min={0} max={240} value={b.target_seconds} onChange={(e) => onChange({ ...b, target_seconds: Number(e.target.value) || 0 })} aria-label={`${b.label} target seconds`} /><span>s</span></label>
      </div>
      {label("Open with", <input value={b.opening_line} onChange={(e) => onChange({ ...b, opening_line: e.target.value })} />)}
      {footer}
      {(b.talking_points.length > 0 || b.key !== "walkthrough") && b.key !== "tool_flexibility" && label("Talking points", <textarea rows={Math.max(2, b.talking_points.length + 1)} defaultValue={b.talking_points.join("\n")} onChange={(e) => onChange({ ...b, talking_points: toLines(e.target.value) })} />)}
      {children}
    </div>
  );
}

function Script({ id, value, nodes, toolLine }: { id: number; value: LoomScript; nodes: LoomPitch["workflow_diagram"]["nodes"]; toolLine: string }) {
  const s = useSection(id, "loom_script");
  const [script, set] = useState(value);
  const total = script.beats.reduce((n, b) => n + b.target_seconds, 0);
  const setBeat = (i: number, b: Beat) => set({ ...script, beats: script.beats.map((x, n) => (n === i ? b : x)), total_seconds: total });
  const setStep = (i: number, w: WalkStep) => set({ ...script, walkthrough: script.walkthrough.map((x, n) => (n === i ? w : x)) });
  const nodeName = (n: string | null | undefined) => nodes.find((x) => x.id === n)?.label ?? n ?? "";
  const drop = script.beats.find((b) => b.key === "proof_drop");
  const out = total < SCRIPT_MIN_SECONDS || total > SCRIPT_MAX_SECONDS;
  return (
    <Frame id={id} section="loom_script" s={s} intro="Talking points, so you sound like yourself. Say them your own way.">
      <p className="muted lp-count">
        <span className={out ? "over-soft" : ""}>{Math.floor(total / 60)}m {total % 60}s in total</span> (target 2.5 to 4 minutes).{" "}
        {script.proof ? <>Proof: <b>{script.proof.name}</b> ({script.proof.kind === "client" ? "real client: say \"a client\", never the name" : script.proof.kind === "demo" ? "demo" : script.proof.kind === "internal_tool" ? "your own tool" : "your own business"}, {script.proof.match} match).</> : <>No proof used: nothing relevant in your library.</>}
      </p>
      <textarea id="lp-script-text" readOnly hidden value={scriptToText(script, nodes, toolLine)} />
      {script.beats.map((b, i) => (b.key === "proof_drop" ? null : (
        <BeatEditor key={b.key} b={b} onChange={(x) => setBeat(i, x)}
          footer={b.key === "hook" && script.positioning_line ? <p className="muted">Then: {script.name ? `I'm ${script.name}. ` : ""}{script.positioning_line} <span className="lp-chip-note">(from your profile, word for word)</span></p> : b.key === "tool_flexibility" ? <p>{toolLine}</p> : null}>
          {b.key === "walkthrough" && (
            <div className="lp-steps">
              {script.walkthrough.map((w, n) => (
                <div className="lp-step" key={w.node_id}>
                  <div className="lp-beat-head"><b>{n + 1}. {nodeName(w.node_id)}</b>{LEVEL[w.pick_level] && <span className={`badge tone-${LEVEL[w.pick_level]!.tone}`}>{LEVEL[w.pick_level]!.text}</span>}</div>
                  {label("What happens", <textarea rows={2} value={w.what_happens} onChange={(e) => setStep(n, { ...w, what_happens: e.target.value })} />)}
                  {label("Options", <textarea rows={w.options.length + 1} defaultValue={w.options.map((o) => `${o.name}: ${o.note}`).join("\n")} onChange={(e) => setStep(n, { ...w, options: toLines(e.target.value).map((l) => { const at = l.indexOf(": "); return at < 0 ? { name: l, note: "" } : { name: l.slice(0, at), note: l.slice(at + 2) }; }) })} />)}
                  {label("My pick", <input value={w.pick} onChange={(e) => setStep(n, { ...w, pick: e.target.value })} />)}
                  {label("Why", <textarea rows={2} value={w.pick_why} onChange={(e) => setStep(n, { ...w, pick_why: e.target.value })} />)}
                  {label("Backup", <input value={w.backup} onChange={(e) => setStep(n, { ...w, backup: e.target.value })} />)}
                  {label("Depends on their setup", <textarea rows={2} value={w.depends_on} onChange={(e) => setStep(n, { ...w, depends_on: e.target.value })} />)}
                  {drop?.node_id === w.node_id && (
                    <BeatEditor b={drop} onChange={(x) => setBeat(script.beats.indexOf(drop), x)} />
                  )}
                </div>
              ))}
            </div>
          )}
        </BeatEditor>
      )))}
      <div className="row"><CopyButton targetId="lp-script-text" label="Copy script" /><SaveButton s={s} value={{ ...script, total_seconds: total }} /></div>
    </Frame>
  );
}

function ToolLine({ id, value }: { id: number; value: string }) {
  const s = useSection(id, "tool_flexibility_line");
  const [line, set] = useState(value);
  return (
    <Frame id={id} section="tool_flexibility_line" s={s}>
      <textarea id="lp-tool-line" rows={3} value={line} onChange={(e) => set(e.target.value)} aria-label="Tool line" />
      <div className="row"><CopyButton targetId="lp-tool-line" label="Copy line" /><SaveButton s={s} value={line} /></div>
    </Frame>
  );
}

function CoverLetter({ id, title, value, loomUrl }: { id: number; title: string; value: string; loomUrl: string | null }) {
  const s = useSection(id, "cover_letter");
  const toast = useToast();
  const [letter, set] = useState(value);
  const [url, setUrl] = useState(loomUrl ?? "");
  const [saving, start] = useTransition();
  const n = coverLength(letter, loomUrl);
  const filled = fillLoomLink(letter, loomUrl ?? "x".repeat(59));
  const saveUrl = () => start(async () => {
    const fd = new FormData();
    fd.set("id", String(id)); fd.set("loom_url", url);
    const r = await saveLoomUrlAction(fd);
    toast(r.error ?? (url.trim() ? "Loom link added" : "Loom link removed"), r.error ? "bad" : undefined);
  });
  return (
    <Frame id={id} section="cover_letter" s={s} intro="Short enough for the whole thing to fit in the preview the client sees.">
      <textarea rows={3} value={letter} onChange={(e) => set(e.target.value)} aria-label="Cover letter" />
      <p className="muted">
        <span className={`lp-count${n > COVER_MAX ? " over-max" : n > COVER_SOFT ? " over-soft" : ""}`} data-testid="cover-count">{n} characters</span>{" "}
        {loomUrl ? "with your Loom link." : "counting a standard Loom link, not the placeholder."} {n > COVER_MAX ? `Over the ${COVER_MAX} limit.` : n > COVER_SOFT ? `Past ${COVER_SOFT}, the part highlighted below may be cut off in the preview.` : `Under ${COVER_SOFT}, so it should all show.`}
      </p>
      {n > COVER_SOFT && <p className="lp-preview">{filled.slice(0, COVER_SOFT)}<mark>{filled.slice(COVER_SOFT)}</mark></p>}
      <div className="row"><SaveButton s={s} value={letter} /></div>

      <div className="lp-item" id="lp-loom-url">
        {label("After recording, paste your Loom link", <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.loom.com/share/..." />)}
        <div className="row"><button type="button" className="secondary" disabled={saving} onClick={saveUrl}>Add to the letter</button></div>
        {loomUrl && (
          <>
            <p><b>This video goes with:</b> {title}<br /><a href={loomUrl} target="_blank" rel="noreferrer">{loomUrl}</a><br /><span className="muted">Check it's the right video before you send.</span></p>
            <textarea id="lp-cover-final" readOnly rows={3} value={fillLoomLink(letter, loomUrl)} aria-label="Finished cover letter" />
            <div><CopyButton targetId="lp-cover-final" label="Copy finished letter" /></div>
          </>
        )}
      </div>
    </Frame>
  );
}

const CATEGORIES = { certifications: "Certifications", experience: "Experience", tone: "Tone of voice", metrics: "Metrics", cover_letter: "Cover letter", custom: "Custom" };

function Screening({ id, value }: { id: number; value: ScreeningAnswer[] }) {
  const s = useSection(id, "screening_answers");
  const toast = useToast();
  const [answers, set] = useState(value);
  const [cats, setCats] = useState<Record<number, string>>({});
  const [busy, start] = useTransition();
  const save = (i: number) => start(async () => {
    const fd = new FormData();
    fd.set("id", String(id)); fd.set("index", String(i)); fd.set("question", answers[i].question); fd.set("answer", answers[i].answer); fd.set("category", cats[i] ?? "custom");
    const r = await saveAnswerToBankAction(fd);
    toast(r.error ?? "Saved to your answer bank", r.error ? "bad" : undefined);
  });
  return (
    <Frame id={id} section="screening_answers" s={s}>
      {answers.length === 0 && <p className="muted">No screening questions on this job.</p>}
      {answers.map((a, i) => (
        <div className="lp-item" key={i}>
          <div className="lp-beat-head"><b>{a.question}</b><span className={`badge tone-${a.source === "bank" ? "good" : a.source === "new" ? "blue" : "warn"}`}>{a.source === "bank" ? "From your bank" : a.source === "new" ? "New" : "Needs your answer"}</span></div>
          <textarea id={`lp-answer-${i}`} rows={3} value={a.answer} placeholder="Nothing in your profile or proof answers this truthfully. Write it yourself." onChange={(e) => set(answers.map((x, n) => (n === i ? { ...x, answer: e.target.value } : x)))} aria-label={a.question} />
          <div className="row">
            <CopyButton targetId={`lp-answer-${i}`} label="Copy" />
            {a.source !== "bank" && a.answer.trim() && (
              <>
                <select aria-label="Bank category" value={cats[i] ?? "custom"} onChange={(e) => setCats({ ...cats, [i]: e.target.value })}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <button type="button" className="secondary" disabled={busy} onClick={() => save(i)}>Save to bank</button>
              </>
            )}
          </div>
        </div>
      ))}
      {answers.length > 0 && <div><SaveButton s={s} value={answers} /></div>}
    </Frame>
  );
}

function Checklist({ id, value }: { id: number; value: string[] }) {
  const s = useSection(id, "pre_record_checklist");
  const [text, set] = useState(value.join("\n"));
  return (
    <Frame id={id} section="pre_record_checklist" s={s}>
      <textarea id="lp-checklist" rows={Math.max(3, value.length + 1)} value={text} onChange={(e) => set(e.target.value)} aria-label="Things to have open before recording" />
      <div className="row"><CopyButton targetId="lp-checklist" label="Copy list" /><SaveButton s={s} value={toLines(text)} /></div>
    </Frame>
  );
}

const key = (v: unknown) => JSON.stringify(v);

export default function LoomPitchPanel({ id, title, pitch, pitchAt, inputs, loomUrl }: { id: number; title: string; pitch: LoomPitch | null; pitchAt: string | null; inputs: LoomInputs | null; loomUrl: string | null }) {
  const [message, action, pending] = useActionState(generateLoomPitchAction, null);
  const inputForm = (
    <form action={action} className="stack" style={{ gap: 10 }} onSubmit={(e) => { if (pitch && !window.confirm("Write the whole Loom pitch again? This replaces every section, including your edits.")) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <div className="grid">
        {label("Budget or rate, if it isn't in the post", <input name="budget" defaultValue={inputs?.budget ?? ""} />)}
        {label("Client's first name, if you can see it", <input name="client_name" defaultValue={inputs?.client_name ?? ""} />)}
      </div>
      {label("Screening questions, one per line", <textarea name="screening_questions" rows={3} defaultValue={inputs?.screening_questions.join("\n") ?? ""} />)}
      {label("What you can see about the client: tools, jobs posted, hire history", <textarea name="client_info" rows={3} defaultValue={inputs?.client_info ?? ""} />)}
      <div><button disabled={pending}><Sparkles size={15} aria-hidden /> {pending ? "Writing… (about a minute)" : pitch ? "Write it all again" : "Write Loom pitch"}</button></div>
    </form>
  );
  return (
    <section id="loom-pitch" className="card stack" style={{ gap: 14, marginTop: 16 }} aria-labelledby="lp-h">
      <div>
        <h2 id="lp-h">Loom pitch</h2>
        <p className="muted">Everything to record a 3 to 4 minute Loom walking them through a workflow you sketched, plus a very short cover letter. Runs only when you click. You record and send everything yourself.{pitchAt ? ` Last written ${new Date(pitchAt).toLocaleString("en-GB")}.` : ""} Proof, tools and positioning come from <a href="/proposals/library">Proof and answers</a>.</p>
      </div>
      {message && <p className="error" role="alert">{message}</p>}
      {pitch ? <details className="lp-item"><summary><b>Job details and write it all again</b></summary>{inputForm}</details> : inputForm}
      {pitch && (
        <>
          <Analysis key={key(pitch.job_analysis)} id={id} value={pitch.job_analysis} />
          <DiagramSection key={key(pitch.workflow_diagram)} id={id} title={title} code={pitch.workflow_diagram.mermaid} steps={pitch.loom_script.walkthrough} />
          <Script key={key(pitch.loom_script)} id={id} value={pitch.loom_script} nodes={pitch.workflow_diagram.nodes} toolLine={pitch.tool_flexibility_line} />
          <ToolLine key={key(pitch.tool_flexibility_line)} id={id} value={pitch.tool_flexibility_line} />
          <CoverLetter key={key(pitch.cover_letter) + (loomUrl ?? "")} id={id} title={title} value={pitch.cover_letter} loomUrl={loomUrl} />
          <Screening key={key(pitch.screening_answers)} id={id} value={pitch.screening_answers} />
          <Checklist key={key(pitch.pre_record_checklist)} id={id} value={pitch.pre_record_checklist} />
        </>
      )}
    </section>
  );
}
