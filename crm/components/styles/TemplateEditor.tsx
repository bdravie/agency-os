"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import ReelFrame from "./ReelFrame";
import { useToast } from "../Toast";
import { saveTemplateAction } from "@/lib/editStyleActions";
import { LAYOUTS, LAYOUT_NAME, MAX_BEATS, cleanTemplate, totalSeconds, type Beat, type Catalogue, type Layout, type Template } from "@/lib/editStylesMath";

// Builds one of the owner's own edit templates: beats in order, each with a layout and the elements on it. The frame beside a beat redraws as it changes.
// Warnings are the brand sheet's limits (the same check the server runs) and never stop a save. Nothing is saved until Save template.
const BACK = "/content?tab=styles&view=templates";

export default function TemplateEditor({ cat, start, saveKey, basedOn }: { cat: Catalogue; start: Template | null; saveKey?: string; basedOn?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(start ? (saveKey ? start.name : `${start.name} (my version)`) : "");
  const [format, setFormat] = useState(start?.format ?? "");
  const [niche, setNiche] = useState(start?.niche ?? "");
  const [length, setLength] = useState(start?.length ?? "");
  const [blurb, setBlurb] = useState(start?.blurb ?? "");
  const [beats, setBeats] = useState<Beat[]>(start?.beats ?? [
    { label: "Hook", layout: "face", elements: ["hook_title", "site_captions", "progress_bar"], seconds: 3, note: "" },
    { label: "Outro", layout: "face", elements: ["end_plate", "music_bed"], seconds: 4, note: "" },
  ]);
  const [busy, setBusy] = useState(false);

  const picks = useMemo(() => cat.groups.filter((g) => g.key !== "layouts").map((g) => ({ g, els: cat.elements.filter((e) => e.group === g.key) })).filter((x) => x.els.length), [cat]);
  const input = { name, format, niche, length, blurb, beats };
  const check = cleanTemplate(input, cat);
  const warnings = "error" in check ? [] : check.warnings;

  const change = (i: number, patch: Partial<Beat>) => setBeats(beats.map((b, n) => (n === i ? { ...b, ...patch } : b)));
  const move = (i: number, by: number) => { const to = i + by; if (to < 0 || to >= beats.length) return; const next = [...beats]; [next[i], next[to]] = [next[to], next[i]]; setBeats(next); };
  const toggle = (i: number, key: string) => change(i, { elements: beats[i].elements.includes(key) ? beats[i].elements.filter((k) => k !== key) : [...beats[i].elements, key] });

  const save = async () => {
    setBusy(true);
    try {
      const r = await saveTemplateAction({ ...input, key: saveKey, basedOn });
      if (r.error) { toast(r.error, "bad"); return; }
      toast("Template saved");
      router.push(BACK);
    } catch (e) {
      toast(`Could not save: ${e instanceof Error ? e.message : String(e)}`, "bad");
    } finally { setBusy(false); }
  };

  return (
    <section className="card es-editor" aria-label="Template editor">
      <h2 style={{ margin: 0 }}>{saveKey ? "Edit template" : start ? `Your version of ${start.name}` : "New template"}</h2>
      <div className="es-fields">
        <label>Name<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Clinic tip to camera" /></label>
        <label>Format<input value={format} maxLength={40} onChange={(e) => setFormat(e.target.value)} placeholder="e.g. Format C" /></label>
        <label>Niche<input value={niche} maxLength={40} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. clinics" /></label>
        <label>Length<input value={length} maxLength={40} onChange={(e) => setLength(e.target.value)} placeholder="e.g. 25 to 40s" /></label>
      </div>
      <label className="stack" style={{ gap: 4 }}><span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>What it is for</span>
        <input value={blurb} maxLength={300} onChange={(e) => setBlurb(e.target.value)} placeholder="One line on when to use this template" />
      </label>

      <ol className="es-rows">
        {beats.map((b, i) => (
          <li key={i} className="es-row es-play">
            <ReelFrame layout={b.layout} elements={b.elements} label={`Beat ${i + 1}: ${b.label}`} />
            <div className="es-row-main">
              <div className="es-row-top">
                <label>Beat {i + 1}<input value={b.label} maxLength={40} onChange={(e) => change(i, { label: e.target.value })} /></label>
                <label>Layout
                  <select value={b.layout} onChange={(e) => change(i, { layout: e.target.value as Layout })}>
                    {LAYOUTS.map((l) => <option key={l} value={l}>{LAYOUT_NAME[l]}</option>)}
                  </select>
                </label>
                <label>Seconds<input type="number" min={0} max={120} step={0.5} value={b.seconds || ""} onChange={(e) => change(i, { seconds: Number(e.target.value) || 0 })} /></label>
              </div>
              <details className="es-more">
                <summary>Elements: {b.elements.length ? b.elements.map((k) => cat.elements.find((e) => e.key === k)?.name ?? k).join(", ") : "none yet"}</summary>
                <div>
              {picks.map(({ g, els }) => (
                <fieldset key={g.key} className="es-picks">
                  <legend>{g.name}</legend>
                  {els.map((e) => (
                    <label key={e.key} className="es-pick" title={e.rule}>
                      <input type="checkbox" checked={b.elements.includes(e.key)} onChange={() => toggle(i, e.key)} />{e.name}
                    </label>
                  ))}
                </fieldset>
              ))}
                </div>
              </details>
              <label>Note for the edit<input value={b.note} maxLength={200} onChange={(e) => change(i, { note: e.target.value })} placeholder="Optional" /></label>
              <div className="es-row-acts">
                <button type="button" className="secondary" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move beat ${i + 1} earlier`}><ArrowUp size={15} aria-hidden /></button>
                <button type="button" className="secondary" onClick={() => move(i, 1)} disabled={i === beats.length - 1} aria-label={`Move beat ${i + 1} later`}><ArrowDown size={15} aria-hidden /></button>
                <button type="button" className="secondary" onClick={() => setBeats(beats.filter((_, n) => n !== i))} disabled={beats.length <= 2} aria-label={`Remove beat ${i + 1}`}><Trash2 size={15} aria-hidden /> Remove</button>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {warnings.length > 0 && (
        <div className="es-warn" role="status">
          Worth a look before you save (you can still save):
          <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      {"error" in check && name.trim() !== "" && <p className="es-warn" role="status">{check.error}</p>}

      <div className="row">
        <button type="button" onClick={save} disabled={busy || "error" in check}>{busy ? "Saving…" : "Save template"}</button>
        <button type="button" className="secondary" disabled={beats.length >= MAX_BEATS} onClick={() => setBeats([...beats, { label: `Step ${beats.length}`, layout: "over_shoulder", elements: ["site_captions"], seconds: 6, note: "" }])}><Plus size={15} aria-hidden /> Add a beat</button>
        <Link href={BACK} className="btn secondary">Cancel</Link>
        <span className="muted">{beats.length} beats, about {totalSeconds(beats)}s</span>
      </div>
    </section>
  );
}
