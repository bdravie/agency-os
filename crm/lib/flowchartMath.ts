// Pure rules for the flowchart builder: what may be saved, and small helpers shared by the server and the browser. No database, so it can be tested on its own.
import { containsContactDetails } from "./audit.ts";

export const TITLE_MAX = 120;
export const CODE_MAX = 50_000;       // Mermaid's own default limit (maxTextSize); the database enforces it too
export const BODY_MAX = 400_000;      // a full diagram as JSON, even if every character needs escaping
export const AUTOSAVE_MS = 2_000;
export const RENDER_DEBOUNCE_MS = 300;

export const FLOWCHART_THEMES = ["auto", "default", "neutral", "dark", "forest"] as const;
export type FlowchartTheme = (typeof FLOWCHART_THEMES)[number];
export type EngineTheme = Exclude<FlowchartTheme, "auto">;
export const THEME_LABELS: Record<FlowchartTheme, string> = { auto: "Match CRM", default: "Default", neutral: "Neutral", dark: "Dark", forest: "Forest" };

export type FlowchartFields = { title: string; code: string; theme: FlowchartTheme };
type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const isTheme = (t: unknown): t is FlowchartTheme => (FLOWCHART_THEMES as readonly unknown[]).includes(t);

function checkTitle(raw: unknown): Checked<string> {
  if (typeof raw !== "string") return { ok: false, error: "The title must be text." };
  const title = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!title) return { ok: false, error: "Give it a title." };
  if (title.length > TITLE_MAX) return { ok: false, error: `Keep the title to ${TITLE_MAX} characters.` };
  if (containsContactDetails(title)) return { ok: false, error: "Leave email addresses and phone numbers out of the title." };
  return { ok: true, value: title };
}

function checkCode(raw: unknown): Checked<string> {
  if (typeof raw !== "string") return { ok: false, error: "The diagram code must be text." };
  // Keeps new lines and tabs. Postgres refuses a NUL, and the other control characters have no use in a diagram.
  const code = raw.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  if (code.length > CODE_MAX) return { ok: false, error: `The diagram is too long: keep it to ${CODE_MAX.toLocaleString("en-GB")} characters.` };
  if (containsContactDetails(code)) return { ok: false, error: "Remove the email address or phone number: diagrams describe processes and roles, not people." };
  return { ok: true, value: code };
}

/** Cleans what was sent, or says why it can't be saved. With `partial`, only the fields present are checked (a rename sends just the title). */
export function checkFlowchartFields(raw: unknown, partial = false): Checked<Partial<FlowchartFields>> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "Nothing to save." };
  const { title, code, theme } = raw as Record<string, unknown>;
  const value: Partial<FlowchartFields> = {};
  if (title !== undefined || !partial) {
    const t = checkTitle(title);
    if (!t.ok) return t;
    value.title = t.value;
  }
  if (code !== undefined || !partial) {
    const c = checkCode(code);
    if (!c.ok) return c;
    value.code = c.value;
  }
  if (theme !== undefined) {
    if (!isTheme(theme)) return { ok: false, error: "That theme is not available." };
    value.theme = theme;
  } else if (!partial) value.theme = "auto";
  return { ok: true, value };
}

export const parseFlowchartId = (raw: unknown): number | null => {
  const s = String(raw ?? "");
  if (!/^[1-9]\d{0,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
};

/** The version a save was based on: `updated_at` as text, because a JavaScript Date would drop the microseconds. */
export const isVersion = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/.test(v);

/** "Match CRM" draws in Mermaid's dark theme when the CRM is dark, its default theme otherwise. A theme chosen by name stays as chosen. */
export const resolveEngineTheme = (theme: FlowchartTheme, crm: "light" | "dark"): EngineTheme =>
  theme === "auto" ? (crm === "dark" ? "dark" : "default") : theme;

const KINDS: [RegExp, string][] = [
  [/^(flowchart|graph)\b/, "Flowchart"], [/^sequenceDiagram\b/, "Sequence diagram"], [/^gantt\b/, "Gantt chart"],
  [/^classDiagram/, "Class diagram"], [/^stateDiagram/, "State diagram"], [/^erDiagram\b/, "Entity diagram"], [/^journey\b/, "Journey"],
  [/^pie\b/, "Pie chart"], [/^mindmap\b/, "Mind map"], [/^timeline\b/, "Timeline"], [/^gitGraph\b/, "Git graph"],
];

/** What sort of diagram the code draws, read from its first real line (past any front matter and comments). */
export function diagramKind(code: string | null | undefined): string {
  const lines = String(code ?? "").split("\n").map((l) => l.trim());
  let i = 0;
  if (lines[0] === "---") {
    const close = lines.indexOf("---", 1);
    if (close > 0) i = close + 1;
  }
  const first = lines.slice(i).find((l) => l && !l.startsWith("%%")) ?? "";
  return KINDS.find(([re]) => re.test(first))?.[1] ?? "Diagram";
}

export const copyTitle = (title: string) => {
  const suffix = " (copy)";
  return title.slice(0, TITLE_MAX - suffix.length).trimEnd() + suffix;
};

/** Search text made safe for ILIKE, where % and _ are wildcards. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

export const fileSlug = (title: string) =>
  title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "flowchart";

export const PNG_SCALES = [1, 2, 4] as const;
export type PngScale = (typeof PNG_SCALES)[number];
const CANVAS_SIDE_MAX = 16_000;       // browsers refuse or silently blank canvases much bigger than this
const CANVAS_AREA_MAX = 120_000_000;

/** The pixel size of a PNG export. A very large diagram at 4x is scaled down to what a browser can draw, and `scale` says what it ended up as. */
export function pngPlan(width: number, height: number, scale: PngScale) {
  const w = Math.max(1, width), h = Math.max(1, height);
  const limit = Math.min(CANVAS_SIDE_MAX / w, CANVAS_SIDE_MAX / h, Math.sqrt(CANVAS_AREA_MAX / (w * h)));
  const used = Math.min(scale, limit);
  return { width: Math.round(w * used), height: Math.round(h * used), scale: used, reduced: used < scale };
}

/** Mermaid's error text, capped so a long diagram can't flood the screen. */
export const cleanMermaidError = (e: unknown) => {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  return (raw.trim() || "This diagram could not be drawn.").slice(0, 1_000);
};
