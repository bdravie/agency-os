"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveEngineTheme, type FlowchartFields, type FlowchartTheme, type PngScale } from "@/lib/flowchartMath";
import { exportPng, exportSvg, type ExportSource } from "@/lib/flowchartExport";
import { useToast } from "@/components/Toast";
import CodeEditor from "./CodeEditor";
import Preview, { type RenderResult } from "./Preview";
import SplitPane from "./SplitPane";
import Toolbar from "./Toolbar";
import { useAutosave } from "./useAutosave";
import { useLeaveGuard } from "./useLeaveGuard";

/** The CRM's own light or dark mode, as it changes (ThemeToggle sets it on the root element). */
function useCrmTheme() {
  const read = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light") as "light" | "dark";
  const [mode, setMode] = useState(read);
  useEffect(() => {
    const watcher = new MutationObserver(() => setMode(read()));
    watcher.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => watcher.disconnect();
  }, []);
  return mode;
}

// The code is the one source of truth: the preview only reads it, so another way of editing (a visual mode, AI) can write to it later without touching the rest.
export default function Workspace({ id, initial, version }: { id: number; initial: FlowchartFields; version: string }) {
  const [fields, setFields] = useState(initial);
  const [editorKey, setEditorKey] = useState(0);
  const [render, setRender] = useState<RenderResult | null>(null);
  const lastGood = useRef<{ code: string; theme: RenderResult["theme"] } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const crm = useCrmTheme();
  const { state, change, save, isUnsaved, acceptTheirs } = useAutosave(id, initial, version);
  const saveNow = useCallback(() => void save(), [save]);
  useLeaveGuard(isUnsaved, saveNow);

  const update = useCallback((patch: Partial<FlowchartFields>) => {
    setFields((f) => ({ ...f, ...patch }));
    change(patch);
  }, [change]);
  const onCode = useCallback((code: string) => update({ code }), [update]);

  const onResult = useCallback((r: RenderResult) => {
    if (!r.error) lastGood.current = { code: r.code, theme: r.theme };
    setRender(r);
  }, []);

  const source = (): ExportSource | null => {
    const good = lastGood.current;
    if (!good) { toast("There is no valid diagram to export yet.", "bad"); return null; }
    const background = canvas.current ? getComputedStyle(canvas.current).backgroundColor : "white";
    return { ...good, title: fields.title, background };
  };
  const onSvg = async () => {
    const s = source();
    if (!s) return;
    try { await exportSvg(s); toast("SVG downloaded"); } catch { toast("The SVG could not be made.", "bad"); }
  };
  const onPng = async (scale: PngScale) => {
    const s = source();
    if (!s) return;
    try {
      const r = await exportPng(s, scale);
      toast(r.reduced ? `PNG downloaded at ${r.scale.toFixed(1)}x: the diagram is too large for ${scale}x` : `PNG ${scale}x downloaded`);
    } catch {
      toast("This diagram could not be made into a PNG. Try the SVG.", "bad");
    }
  };
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(fields.code); toast("Mermaid code copied"); } catch { toast("The browser would not let the code be copied.", "bad"); }
  };

  const useTheirs = () => {
    const theirs = acceptTheirs();
    if (theirs) { setFields(theirs); setEditorKey((k) => k + 1); }
  };

  const message = state.status === "refused" || state.status === "failed" ? state.message : null;
  const failed = Boolean(render?.error);

  return (
    <div className="fc fc-workspace">
      <Toolbar
        title={fields.title} onTitle={(title) => update({ title })}
        theme={fields.theme} onTheme={(theme: FlowchartTheme) => update({ theme })}
        state={state} onSvg={onSvg} onPng={onPng} onCopy={onCopy}
      />
      {message && <p className="fc-banner fc-banner-bad" role="alert">Not saved: {message}</p>}
      {state.status === "conflict" && (
        <div className="fc-banner fc-banner-bad" role="alert">
          <span>This flowchart was changed somewhere else since you opened it, perhaps in another tab.</span>
          <span className="row">
            <button type="button" className="secondary" onClick={useTheirs}>Use the other version</button>
            <button type="button" className="secondary" onClick={() => void save({ overwrite: true })}>Keep mine</button>
          </span>
        </div>
      )}
      <SplitPane
        left={
          <div className="fc-code card">
            <CodeEditor key={editorKey} initial={fields.code} onChange={onCode} onSave={saveNow} />
            {render?.error && <pre className="fc-error" role="status" aria-live="polite">{render.error}</pre>}
          </div>
        }
        right={<Preview code={fields.code} theme={resolveEngineTheme(fields.theme, crm)} onResult={onResult} canvasRef={canvas} failed={failed} />}
      />
    </div>
  );
}
