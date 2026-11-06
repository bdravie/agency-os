"use client";

import { useEffect, useRef, useState } from "react";
import { cleanMermaidError, RENDER_DEBOUNCE_MS, type EngineTheme } from "@/lib/flowchartMath";
import { renderDiagram } from "@/lib/mermaidClient";

const crmTheme = (): EngineTheme => (document.documentElement.dataset.theme === "dark" ? "dark" : "default");

// Draws one diagram with the CRM's single Mermaid set-up. Mermaid only loads when this first draws. An error keeps the last good picture on screen.
export default function MermaidView({ code }: { code: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const svg = await renderDiagram(code, crmTheme());
        if (live && box.current) { box.current.innerHTML = svg; setError(null); }
      } catch (e) {
        if (live) setError(cleanMermaidError(e));
      }
    }, RENDER_DEBOUNCE_MS);
    return () => { live = false; clearTimeout(timer); };
  }, [code]);
  return (
    <>
      <div ref={box} className="lp-diagram" role="img" aria-label="Workflow diagram" />
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
