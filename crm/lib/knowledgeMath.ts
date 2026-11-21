// Pure rules for the knowledge-base assistant (crm/lib/assistant.ts): cutting Markdown into passages, finding the passages
// that best match a question (BM25 keyword scoring, no embeddings and no API call), checking a question before it is sent,
// and reading an answer back into blocks the page can draw without HTML injection. Tested in tests/knowledgeMath.test.mjs.

export type Passage = { id: string; topic: string; file: string; heading: string; text: string };

const MAX_CHARS = 1600;

/** Cuts a Markdown file into passages: one per section, a long section split at bullets, paragraphs, then sentences. */
export function chunkMarkdown(file: string, topic: string, md: string, maxChars = MAX_CHARS): Passage[] {
  const lines = md.replace(/\r\n?/g, "\n").replace(/^---\n[\s\S]*?\n---\n/, "").split("\n");
  const out: Passage[] = [];
  const headings: string[] = [];
  let blocks: string[] = [];
  let current = "";
  let inFence = false;

  const heading = () => headings.filter(Boolean).join(" > ");
  const push = (text: string) => {
    const t = text.trim();
    if (t) out.push({ id: `${file}#${out.length + 1}`, topic, file, heading: heading(), text: t });
  };
  const flush = () => {
    if (current.trim()) blocks.push(current);
    current = "";
    let chunk = "";
    for (const b of blocks) {
      for (const piece of b.length > maxChars ? splitLong(b, maxChars) : [b]) {
        if (chunk && chunk.length + piece.length + 2 > maxChars) { push(chunk); chunk = ""; }
        chunk = chunk ? `${chunk}\n\n${piece}` : piece;
      }
    }
    push(chunk);
    blocks = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const h = !inFence && /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const level = h[1].length;
      headings.length = level - 1;
      headings[level - 1] = h[2].replace(/[*_`]/g, "").trim();
      continue;
    }
    // A new paragraph or a new top-level bullet starts a block; indented and continuing lines stay with the block.
    const startsBlock = !inFence && (line.trim() === "" || /^(?:[-*+]|\d+\.)\s/.test(line));
    if (startsBlock && current.trim()) { blocks.push(current); current = ""; }
    if (line.trim() === "" && !inFence) continue;
    current = current ? `${current}\n${line}` : line;
  }
  flush();
  return out;
}

function splitLong(text: string, max: number): string[] {
  const sentences = text.match(/[^.!?\n]+(?:[.!?]+|\n|$)/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + s.length > max) { out.push(cur.trim()); cur = ""; }
    if (s.length > max) { for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim()); continue; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

const STOP = new Set(("a an and are as at be but by can do does for from has have how i if in into is it its me my of on or our so " +
  "that the their them then there these they this to up us was we what when where which who why will with you your should would " +
  "could about any all also than not no").split(" "));

/** Lower-case words without stop words, with a light stem so "contracts", "contracting" and "contract" meet. */
export function tokenise(text: string): string[] {
  return (text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").match(/[a-z0-9]+/g) ?? [])
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

function stem(w: string): string {
  if (w.length <= 4) return w;
  for (const suffix of ["ings", "ing", "ies", "ied", "es", "ed", "ly", "s"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) return suffix === "ies" || suffix === "ied" ? w.slice(0, -3) + "y" : w.slice(0, -suffix.length);
  }
  return w;
}

export type KnowledgeIndex = { passages: Passage[]; docs: Map<string, number>[]; lengths: number[]; df: Map<string, number>; avg: number };

/** Builds the keyword index once per set of files. The heading counts twice, since it says what the passage is about. */
export function buildIndex(passages: Passage[]): KnowledgeIndex {
  const docs: Map<string, number>[] = [];
  const lengths: number[] = [];
  const df = new Map<string, number>();
  for (const p of passages) {
    const words = tokenise(`${p.heading} ${p.heading} ${p.text}`);
    const tf = new Map<string, number>();
    for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1);
    for (const w of tf.keys()) df.set(w, (df.get(w) ?? 0) + 1);
    docs.push(tf);
    lengths.push(words.length);
  }
  const avg = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  return { passages, docs, lengths, df, avg };
}

/** The best-matching passages for a question (BM25). With a topic, only that topic's files are searched. Never more than `k`. */
export function retrieve(index: KnowledgeIndex, question: string, opts: { topic?: string | null; k?: number } = {}): Passage[] {
  const k = opts.k ?? 8;
  const terms = [...new Set(tokenise(question))];
  if (!terms.length) return [];
  const n = index.passages.length;
  const scored: { i: number; score: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (opts.topic && index.passages[i].topic !== opts.topic) continue;
    let score = 0;
    for (const t of terms) {
      const f = index.docs[i].get(t);
      if (!f) continue;
      const df = index.df.get(t) ?? 0;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      score += idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (index.lengths[i] / (index.avg || 1)))));
    }
    if (score > 0) scored.push({ i, score });
  }
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, k).map((s) => index.passages[s.i]);
}

export const QUESTION_MAX = 2000;
const EMAIL = /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i;
const PHONE = /(?:\+44\s?\(?0?\)?|\b0)(?:[\s-]?\d){9,10}\b/;

/** Why a question cannot be sent, or null. Contact details are refused before anything is saved or sent to the AI. */
export function questionProblem(q: string): string | null {
  const t = q.trim();
  if (!t) return "Type a question first.";
  if (t.length > QUESTION_MAX) return `Keep a question under ${QUESTION_MAX.toLocaleString("en-GB")} characters (this one is ${t.length.toLocaleString("en-GB")}).`;
  if (EMAIL.test(t)) return "Leave out email addresses: the assistant does not need anyone's contact details to answer.";
  if (PHONE.test(t)) return "Leave out phone numbers: the assistant does not need anyone's contact details to answer.";
  return null;
}

/** The passages as the AI sees them, numbered K1, K2... so it can cite them. */
export function passagesBlock(passages: Passage[]): string {
  if (!passages.length) return "(No passage in the knowledge files matched this question.)";
  return passages.map((p, i) => `[K${i + 1}] ${p.file}${p.heading ? ` > ${p.heading}` : ""}\n${p.text}`).join("\n\n---\n\n");
}

// ---------- Reading an answer back for display (no HTML is ever injected) ----------

export type Inline = { t: "text" | "bold" | "code" | "cite"; v: string };
export type Block =
  | { kind: "h"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "code"; text: string };

/** Splits a Markdown-ish answer into headings, paragraphs, lists and code. Anything unrecognised is a paragraph. */
export function parseAnswer(text: string): Block[] {
  const out: Block[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;
  let code: string[] | null = null;
  const endPara = () => { if (para.length) out.push({ kind: "p", text: para.join(" ") }); para = []; };
  const endList = () => { if (list) out.push(list); list = null; };
  for (const raw of lines) {
    if (code) {
      if (/^\s*```/.test(raw)) { out.push({ kind: "code", text: code.join("\n") }); code = null; } else code.push(raw);
      continue;
    }
    if (/^\s*```/.test(raw)) { endPara(); endList(); code = []; continue; }
    const line = raw.trimEnd();
    if (!line.trim()) { endPara(); endList(); continue; }
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) { endPara(); endList(); out.push({ kind: "h", text: h[1].replace(/\*\*/g, "") }); continue; }
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      endPara();
      const kind = ul ? "ul" : "ol";
      if (!list || list.kind !== kind) { endList(); list = { kind, items: [] }; }
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    if (list && /^\s{2,}\S/.test(raw)) { list.items[list.items.length - 1] += ` ${line.trim()}`; continue; }
    endList();
    para.push(line.trim());
  }
  if (code) out.push({ kind: "code", text: code.join("\n") });
  endPara(); endList();
  return out;
}

/** Bold, inline code and source markers like [K2] or [W1, K3] inside one line. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[((?:[KW]\d{1,2})(?:\s*,\s*[KW]\d{1,2})*)\]/g;
  let last = 0;
  for (let m; (m = re.exec(text)); ) {
    if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "bold", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "code", v: m[2] });
    else for (const ref of m[3].split(/\s*,\s*/)) out.push({ t: "cite", v: ref });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

// ---------- Assembling an answer from the API's content blocks ----------

export type AssistantSource = { ref: string; kind: "file" | "web"; title: string; path?: string; url?: string };
/** A content block as the API returns it (text, thinking, web search results...), typed only as far as this code reads it. */
export type AnswerBlock = { type: string; text?: string; citations?: { type: string; url?: string; title?: string }[] | null; content?: unknown };

/** Joins the answer's text, adding [W1]-style markers where the AI cited a web page (https only), and lists those pages. */
export function assembleAnswer(blocks: AnswerBlock[]): { text: string; webSources: AssistantSource[] } {
  const urls: { url: string; title: string }[] = [];
  const refFor = (url: string, title: string) => {
    let i = urls.findIndex((u) => u.url === url);
    if (i < 0) { urls.push({ url, title }); i = urls.length - 1; }
    return `W${i + 1}`;
  };
  let text = "";
  for (const b of blocks) {
    if (b.type !== "text" || !b.text) continue;
    text += b.text;
    const refs = [...new Set((b.citations ?? []).filter((c) => c.type === "web_search_result_location" && c.url && /^https:\/\//.test(c.url)).map((c) => refFor(c.url!, c.title || c.url!)))];
    if (refs.length) text += ` [${refs.join(", ")}]`;
  }
  // The dynamic web search filters results through code execution and often attaches no inline citation, so the pages the
  // search returned are listed too (after any cited ones, at most 6 in all), so the owner can always see what it read.
  for (const b of blocks) {
    if (b.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue;
    for (const r of b.content as { type?: string; url?: string; title?: string }[]) {
      if (urls.length >= 6) break;
      if (r?.type === "web_search_result" && r.url && /^https:\/\//.test(r.url)) refFor(r.url, r.title || r.url);
    }
  }
  return {
    text: text.trim(),
    webSources: urls.map((u, i) => ({ ref: `W${i + 1}`, kind: "web" as const, title: u.title.slice(0, 200), url: u.url })),
  };
}

/** The source markers an answer uses, in order of first use. */
export function citedRefs(text: string): string[] {
  const seen: string[] = [];
  for (const m of text.matchAll(/\[((?:[KW]\d{1,2})(?:\s*,\s*[KW]\d{1,2})*)\]/g)) {
    for (const ref of m[1].split(/\s*,\s*/)) if (!seen.includes(ref)) seen.push(ref);
  }
  return seen;
}
