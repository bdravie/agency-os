// Pure helpers for the Upwork pitch pack (no AI, no database), so they can be tested on their own.

export type LoomBeat = { say: string; on_screen: string };
export type Pack = {
  client_name: string | null;
  system_title: string;
  what_they_asked: string;
  explanation: string;
  steps: string[];
  diagram: string;
  loom: { hook: string; show: LoomBeat[]; close: string; prep: string[] };
  data_note: string | null;
  fit_note: string;
  cover_letter: string;
};

/** Keep only a plain first name; the job post is the only source and it is never stored as a contact. */
export const cleanName = (n: string | null) => (n && /^[A-Za-z][A-Za-z'’-]{1,24}$/.test(n.trim()) ? n.trim() : null);

/** A Mermaid flowchart the model wrote, made safe to paste: must start with "flowchart", no code fences. */
export function cleanDiagram(d: string, steps: string[]): string {
  const body = d.replace(/```(?:mermaid)?/g, "").trim();
  if (/^flowchart\s+(LR|TD)\b/.test(body)) return body;
  const label = (s: string) => s.replace(/[\[\]()"{}]/g, "").slice(0, 60);
  return "flowchart LR\n" + steps.map((s, i) => `  S${i}[${label(s)}]`).join("\n") + "\n" + steps.slice(1).map((_, i) => `  S${i} --> S${i + 1}`).join("\n");
}

export function fillCover(template: string, p: Pick<Pack, "client_name" | "system_title" | "what_they_asked" | "explanation" | "steps">, about: string, sender: string, hasLoom: boolean): string {
  const name = cleanName(p.client_name);
  let out = template
    .replace("{client_greeting}", name ? ` ${name}` : "")
    .replace("{what_they_asked}", p.what_they_asked.replace(/[.\s]+$/, ""))
    .replace("{system_title}", p.system_title.trim())
    .replace("{loom_line}", hasLoom ? " and a short Loom walking through it" : "")
    .replace("{explanation}", p.explanation)
    .replace("{steps}", p.steps.map((s, i) => `${i + 1}. ${s.replace(/^\d+[.)]\s*/, "")}`).join("\n"))
    .replace("{sender}", sender);
  out = about ? out.replace("{about_me}", about) : out.replace(/About me:\n\{about_me\}\n\n/, "");
  return out.trim();
}


/** What is wrong with the model's reply, if anything. Structured output is not enforced by the API, so check it before saving. */
export function packProblems(r: any): string[] {
  const bad: string[] = [];
  const text = (v: unknown) => typeof v === "string" && v.trim().length > 0 && !/<\/?parameter|<invoke/i.test(v);
  for (const k of ["system_title", "what_they_asked", "explanation", "diagram", "fit_note"]) if (!text(r?.[k])) bad.push(k);
  if (!Array.isArray(r?.steps) || r.steps.length < 3 || !r.steps.every(text)) bad.push("steps");
  const l = r?.loom;
  if (!l || typeof l !== "object") bad.push("loom");
  else {
    if (!text(l.hook)) bad.push("loom.hook");
    if (!text(l.close)) bad.push("loom.close");
    if (!Array.isArray(l.show) || l.show.length < 2 || !l.show.every((b: any) => text(b?.say) && text(b?.on_screen))) bad.push("loom.show");
    if (!Array.isArray(l.prep)) bad.push("loom.prep");
  }
  return bad;
}
