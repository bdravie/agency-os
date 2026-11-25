// Pure rules for Run a demo on a proposal (no database, no processes, no network), so they can be tested on their own.
// Two jobs: read config/demos.yaml into recipes the CRM may run (and refuse anything else), and score the owner's demos
// against a job post so the three closest can be offered. The score is worked out here from shared tools, tags and wording: no AI.

/** A command as written in config/demos.yaml: the first word says what runs it, the rest is passed to it untouched (no shell). */
export type Cmd = string[];
export type OpenLink = { label: string; url: string };
export type Serve = { command: Cmd; cwd: "root" | "demo"; port: number; env: Record<string, string>; open: OpenLink[] };
export type Recipe = { folder: string; proof: string; title: string; shows: string; steps: Cmd[]; serve: Serve | null; n8n: string[]; make: string[]; note: string };

export const RUNNERS = ["node", "python", "npm"] as const;
/** Ports a demo page may not take: the CRM's own, and the two n8n uses. */
const TAKEN_PORTS = new Set([3000, 5678, 5679]);
/** Settings a demo is never handed or allowed to set, so a demo run can't reach the live database or spend on an account. */
const BLOCKED_ENV = /^(PATH|HOME|NODE_OPTIONS|LD_|DYLD_|DATABASE_URL|.*(KEY|TOKEN|SECRET|PASSWORD).*)$/;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** What is wrong with one command, or null. Arguments stay inside the project: no absolute paths, no "..", no home folder. */
export function commandProblem(cmd: unknown): string | null {
  if (!Array.isArray(cmd) || !cmd.length || cmd.length > 14 || cmd.some((a) => typeof a !== "string" || !a || a.length > 200 || /[\0\n\r]/.test(a))) return "is not a short list of words";
  if (!(RUNNERS as readonly string[]).includes(cmd[0])) return `must start with ${RUNNERS.join(", ")} (not "${cmd[0]}")`;
  const bad = cmd.slice(1).find((a: string) => a.startsWith("/") || a.startsWith("~") || a.split(/[\\/]/).includes(".."));
  return bad ? `points outside the project ("${bad}")` : null;
}

/** config/demos.yaml as recipes. An entry that breaks a rule is left out and named in `problems`, so one bad line never runs and never hides the rest. */
export function cleanRecipes(raw: unknown): { recipes: Recipe[]; problems: string[] } {
  const recipes: Recipe[] = [], problems: string[] = [];
  const list = Array.isArray((raw as { demos?: unknown })?.demos) ? (raw as { demos: unknown[] }).demos : [];
  for (const [i, entry] of list.entries()) {
    const e = entry as Record<string, any>, folder = str(e?.folder, 90);
    const fail = (why: string) => { problems.push(`${folder || `entry ${i + 1}`}: ${why}`); };
    if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(folder)) { fail("the folder must be a plain folder name under demos/"); continue; }
    if (recipes.some((r) => r.folder === folder)) { fail("is listed twice"); continue; }
    const steps: Cmd[] = Array.isArray(e.steps) ? e.steps : [];
    const wrong = steps.map(commandProblem).find(Boolean);
    if (steps.length > 8) { fail("has more than 8 steps"); continue; }
    if (wrong) { fail(`a step ${wrong}`); continue; }
    let serve: Serve | null = null;
    if (e.serve) {
      const s = e.serve as Record<string, any>, port = Number(s.port), why = commandProblem(s.command);
      if (why) { fail(`the serve command ${why}`); continue; }
      if (!Number.isInteger(port) || port < 1024 || port > 65535 || TAKEN_PORTS.has(port)) { fail("the port must be a free one from 1024 up (not the CRM's or n8n's)"); continue; }
      const env: Record<string, string> = {};
      let envBad = "";
      for (const [k, v] of Object.entries(s.env ?? {})) {
        if (!/^[A-Z][A-Z0-9_]{0,40}$/.test(k) || BLOCKED_ENV.test(k) || typeof v !== "string" || v.length > 100) envBad = k; else env[k] = v;
      }
      if (envBad) { fail(`may not set ${envBad}`); continue; }
      const open: OpenLink[] = (Array.isArray(s.open) ? s.open : []).map((o: any) => ({ label: str(o?.label, 40), url: typeof o?.url === "string" ? o.url.trim() : "" }));
      if (!open.length || open.length > 4 || open.some((o) => !o.label || !o.url.startsWith(`http://127.0.0.1:${port}/`) || o.url.length > 300 || /\s/.test(o.url))) { fail(`each address to open must start http://127.0.0.1:${port}/`); continue; }
      serve = { command: s.command, cwd: s.cwd === "demo" ? "demo" : "root", port, env, open };
    }
    if (!steps.length && !serve) { fail("has nothing to run"); continue; }
    const n8n: string[] = Array.isArray(e.n8n) ? e.n8n : [], make: string[] = Array.isArray(e.make) ? e.make : [];
    const outside = (f: unknown) => typeof f !== "string" || !f.startsWith(`demos/${folder}/`) || !f.endsWith(".json") || f.split("/").includes("..") || /[\s'"`$;&|<>\\]/.test(f);
    if (n8n.length > 6 || n8n.some(outside)) { fail("the n8n files must be .json files inside its own folder"); continue; }
    if (make.length > 6 || make.some(outside)) { fail("the make files must be .json files inside its own folder"); continue; }
    recipes.push({ folder, proof: str(e.proof, 120), title: str(e.title, 120) || folder, shows: str(e.shows, 300), steps, serve, n8n, make, note: str(e.note, 300) });
  }
  return { recipes, problems };
}

/** A demo's main workflow file (the first one listed, n8n before Make): what the Build plan reads as "a workflow you already have". */
export const mainWorkflowFile = (r: Recipe): string | null => r.n8n[0] ?? r.make[0] ?? null;

/** The lines to paste in Terminal to load a demo's workflows into n8n, for showing it there. */
export const n8nImportLines = (r: Recipe) => r.n8n.map((f) => `npx n8n import:workflow --input=${f}`);

/** What a run printed, ready for the screen: no colour codes, and only the last part of something very long. */
export function tidyOutput(text: string, max = 6000): string {
  const plain = text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  return plain.length > max ? `…\n${plain.slice(-max)}` : plain;
}

// ---------- Which demo is closest to this job ----------

export type DemoCandidate = { key: string; name: string; one_line: string; problem: string; tags: string[]; tools: string[]; recipe: Recipe | null };
export type DemoMatch = { key: string; name: string; one_line: string; score: number; shares: string[]; recipe: Recipe | null };
type ProofLike = { id: number; name: string; kind: string; one_line: string | null; problem_solved: string | null; tags: string[] | null; tools: string[] | null };

/** The owner's demos (Proof and answers, kind Demo), each joined to its recipe when it has one. A recipe with no proof entry still counts, on its own wording. */
export function joinDemos(proof: ProofLike[], recipes: Recipe[]): DemoCandidate[] {
  const left = new Set(recipes), out: DemoCandidate[] = [];
  for (const p of proof.filter((x) => x.kind === "demo")) {
    const recipe = recipes.find((r) => left.has(r) && r.proof && p.name.toLowerCase().startsWith(r.proof.toLowerCase())) ?? null;
    if (recipe) left.delete(recipe);
    out.push({ key: `proof:${p.id}`, name: p.name, one_line: p.one_line ?? "", problem: p.problem_solved ?? "", tags: p.tags ?? [], tools: p.tools ?? [], recipe });
  }
  for (const r of left) out.push({ key: `folder:${r.folder}`, name: r.title, one_line: r.shows, problem: "", tags: [], tools: [], recipe: r });
  return out;
}

const STOP = new Set(("a an and are as at be but by for from has have i in is it its of on or our so that the their them they this to we were what when which who will with you your " +
  "need needs want wants looking help using use used can also into over each every any all more most than then there about up out new one get gets make makes built build demo demos " +
  "no not nothing time times number numbers person people ask asks back link links hand day days way work works working set sets send sends sent run runs running take takes see show shows " +
  "keep keeps kept same own just only still even first next last without within while where after before between both other another per via really much many some such how why here now " +
  "always never automatically someone anyone answer answers answered goes going done does did").split(" "));
/** Tags that say what kind of entry it is, not what it does. */
const LABEL_TAGS = new Set(["demo", "real-client", "internal", "tooling"]);
const stem = (w: string) => (w.length > 4 && w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const words = (s: string) => s.toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
const squash = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

/**
 * Scores each demo against the job post out of 100, best first. Three things count, in this order of weight: its tags that the post
 * talks about (missed calls, invoices, a chatbot), its tools that the post names, and how much of its own distinctive wording the
 * post shares. Words most demos use count for little. `shares` is what was found, so the score can be read, not just trusted.
 */
export function rankDemos(job: string, cands: DemoCandidate[]): DemoMatch[] {
  const jobWords = new Set(words(job)), jobText = squash(job);
  const texts = cands.map((c) => [...new Set(words(`${c.name} ${c.one_line} ${c.problem}`))]);
  const seenIn = new Map<string, number>();
  for (const t of texts) for (const w of t) seenIn.set(w, (seenIn.get(w) ?? 0) + 1);
  const weight = (w: string) => ((seenIn.get(w) ?? 1) > Math.max(1, cands.length / 2) ? 0.25 : 1);

  const scored = cands.map((c, i): DemoMatch & { order: number } => {
    const tags = [...new Set(c.tags.map((t) => t.toLowerCase().trim()).filter((t) => t && !LABEL_TAGS.has(t)))];
    const tagHits = tags.filter((t) => { const w = words(t.replace(/-/g, " ")); return w.length > 0 && w.every((x) => jobWords.has(x)); });
    const tools = [...new Set(c.tools.map((t) => t.trim()).filter(Boolean))];
    const toolHits = tools.filter((t) => jobText.includes(squash(t)));
    const total = texts[i].reduce((n, w) => n + weight(w), 0), hit = texts[i].filter((w) => jobWords.has(w));
    // Full marks on a part come from 4 shared tags, 3 shared tools, or 8 shared distinctive words: a demo is not marked down for
    // having a long description or niche tags the post has no reason to mention.
    const parts = [
      tags.length ? { w: 0.45, v: Math.min(1, tagHits.length / Math.min(4, tags.length)) } : null,
      tools.length ? { w: 0.25, v: Math.min(1, toolHits.length / Math.min(3, tools.length)) } : null,
      total > 0 ? { w: 0.3, v: Math.min(1, hit.reduce((n, w) => n + weight(w), 0) / Math.min(8, total)) } : null,
    ].filter(Boolean) as { w: number; v: number }[];
    const raw = parts.length ? parts.reduce((n, p) => n + p.w * p.v, 0) / parts.reduce((n, p) => n + p.w, 0) : 0;
    // What was found, tools first. One mention is enough: "Google Sheets" the tool covers "google sheets" the tag and "sheet" the word.
    const found = [...toolHits, ...tagHits.map((t) => t.replace(/-/g, " ")), ...hit.filter((w) => weight(w) === 1).slice(0, 4)].map((s) => s.trim());
    const kept = found.filter((s, n) => !found.some((o, m) => m !== n && (squash(o) === squash(s) ? m < n : squash(o).includes(squash(s))))).slice(0, 6);
    return { key: c.key, name: c.name, one_line: c.one_line, score: Math.round(raw * 100), shares: kept, recipe: c.recipe, order: i };
  });
  return scored.sort((a, b) => b.score - a.score || Number(!!b.recipe) - Number(!!a.recipe) || a.order - b.order).map(({ order: _order, ...m }) => m);
}

/**
 * The selection shown: the three closest demos that can be run from here, and (so nothing is hidden) up to two that score higher
 * than the best of those but have no run set up.
 */
export function pickTop(ranked: DemoMatch[]): { top: DemoMatch[]; closer: DemoMatch[] } {
  const top = ranked.filter((m) => m.recipe).slice(0, 3);
  const bar = top[0]?.score ?? -1;
  return { top, closer: ranked.filter((m) => !m.recipe && m.score > bar && m.score > 0).slice(0, 2) };
}
