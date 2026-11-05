import { fileSlug, pngPlan, type EngineTheme, type PngScale } from "./flowchartMath";
import { renderDiagram } from "./mermaidClient";

// Exports redraw the last valid diagram with plain SVG labels, so the same picture opens in a browser, a design tool or a PNG.
export type ExportSource = { code: string; theme: EngineTheme; title: string; background: string };

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function standaloneSvg({ code, theme, background }: ExportSource) {
  // Parsed as HTML then written back as XML, so tags Mermaid leaves unclosed can't make the file invalid.
  const holder = document.createElement("div");
  holder.innerHTML = await renderDiagram(code, theme, true);
  const svg = holder.querySelector("svg");
  if (!svg) throw new Error("Mermaid returned no picture");
  const box = svg.viewBox.baseVal;
  const width = Math.ceil(box?.width || parseFloat(svg.getAttribute("width") ?? "") || 800);
  const height = Math.ceil(box?.height || parseFloat(svg.getAttribute("height") ?? "") || 600);
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.style.maxWidth = "none";
  svg.style.backgroundColor = background;
  return { text: new XMLSerializer().serializeToString(svg), width, height };
}

export async function exportSvg(source: ExportSource) {
  const { text } = await standaloneSvg(source);
  download(new Blob([text], { type: "image/svg+xml" }), `${fileSlug(source.title)}.svg`);
}

/** Returns the scale it ended up at, because a very large diagram may not fit a browser canvas at the one asked for. */
export async function exportPng(source: ExportSource, scale: PngScale): Promise<{ reduced: boolean; scale: number }> {
  const { text, width, height } = await standaloneSvg(source);
  const plan = pngPlan(width, height, scale);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The picture could not be prepared"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  });
  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the picture");
  ctx.fillStyle = source.background;
  ctx.fillRect(0, 0, plan.width, plan.height);
  ctx.drawImage(image, 0, 0, plan.width, plan.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("This browser could not make the PNG");
  download(blob, `${fileSlug(source.title)}-${scale}x.png`);
  return { reduced: plan.reduced, scale: plan.scale };
}
