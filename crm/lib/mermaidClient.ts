import type { Mermaid } from "mermaid";
import { CODE_MAX, type EngineTheme } from "./flowchartMath";

// The only place Mermaid is loaded and set up, in the browser, the first time a diagram is drawn, so it never slows other pages.
// securityLevel 'strict' encodes HTML in labels and disables click handlers; Mermaid does not let a %%{init}%% line in the diagram change it.
let engine: Promise<Mermaid> | null = null;
const load = () => (engine ??= import("mermaid").then((m) => m.default));

let seq = 0;
let queue: Promise<unknown> = Promise.resolve();

/**
 * Draws a diagram and returns its SVG text. Mermaid's settings are global, so draws run one at a time.
 * `portable` uses plain SVG text for labels: HTML labels stop a browser turning the SVG into a PNG, and most design tools can't open them.
 */
export function renderDiagram(code: string, theme: EngineTheme, portable = false): Promise<string> {
  const draw = async () => {
    const mermaid = await load();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      maxTextSize: CODE_MAX,
      theme,
      htmlLabels: !portable,
      flowchart: { htmlLabels: !portable },
    });
    const id = `fc-draw-${++seq}`;
    try {
      return (await mermaid.render(id, code)).svg;
    } finally {
      // Mermaid can leave its scratch element behind when a diagram fails.
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  };
  const result = queue.then(draw, draw);
  queue = result.catch(() => undefined);
  return result;
}
