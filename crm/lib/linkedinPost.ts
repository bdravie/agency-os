import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { query } from "./db";
import { askStructured, linkedinModel } from "./llm";
import { withPositioning } from "./positioning";
import { guide } from "./content";
import { parseScript, pickHooks } from "./filmMath";
import { loadBanned } from "./ideaGeneration";
import { scriptEvidence } from "./scriptItem";
import { loadPosts } from "./contentPerformance";
import { evidenceDigest } from "./ideaEvidenceMath";
import type { Breakdown } from "./breakdownMath";
import {
  IMAGE_KINDS, LINKEDIN_FORMAT, assemblePost, cleanPostImage, draftProblems, imageProblems, imageTextProblem, mermaidFromGraph,
  type GraphEdge, type GraphNode, type ImageKind, type ImageSize, type PostImage,
} from "./linkedinMath";

// The two AI steps on Content > LinkedIn, both click-only: writing a post, and choosing the words for its image.
// The AI only writes; linkedinMath.ts decides what is allowed, and a post that fails is asked for once more, then refused.

const root = () => (existsSync(path.join(process.cwd(), "prompts")) ? process.cwd() : path.resolve(process.cwd(), ".."));
const prompt = (name: string) => readFile(path.join(root(), "prompts", name), "utf8");
const S = { type: "string" } as const;

export type Draft = { title: string; opening: string; openingAlt: string; text: string };
export type DraftSource = { fromItemId?: number | null; topic?: string | null; notes?: string | null };

// Shown only when there is no API key (demo mode), so the screen has something to work with. A failed AI call is reported, never replaced by this.
const EXAMPLE: Draft = {
  title: "Example: the enquiry nobody wrote down",
  opening: "The phone rang on a roof, and the job was gone before anyone came down the ladder.",
  openingAlt: "Most lost work is never turned down. It is just never written down.",
  text: assemblePost(
    "The phone rang on a roof, and the job was gone before anyone came down the ladder.",
    "This is an example post, shown because no AI key is set.\n\nNobody decided to ignore that enquiry. It arrived at a bad moment and there was nowhere for it to land.\n\nThe fix is rarely more effort. It is one place every enquiry goes, whoever picks it up:\n\n- The call or message is logged the moment it arrives\n- One person is told it is theirs\n- The customer hears back the same day, even if only to say when\n\nNone of that needs anyone to work harder. It needs the gap between the phone and the diary to close.\n\nWhere does an enquiry go in your business when everyone is busy?",
    ["trades", "smallbusiness"]),
};

/** What the post is written from: a video idea already in Content (its hook and script), a topic typed in, or both, plus any notes. */
async function sourceBlock(src: DraftSource): Promise<{ text: string; idea: string; niche: string | null; pillar: string | null } | { error: string }> {
  const topic = (src.topic ?? "").trim(), notes = (src.notes ?? "").trim();
  let idea = topic, niche: string | null = null, pillar: string | null = null;
  const parts: string[] = [];
  if (src.fromItemId) {
    const [item] = await query<any>(`SELECT idea, hook, script, caption, notes, niche, pillar, format FROM content_items WHERE id = $1`, [src.fromItemId]);
    if (!item) return { error: "That video idea no longer exists." };
    const parsed = parseScript(item.script);
    idea = idea || String(item.idea);
    niche = item.niche ?? null; pillar = item.pillar ?? null;
    parts.push(`A short video the owner planned or made.\nIdea: ${item.idea}`, item.hook ? `Video hook: ${item.hook}` : "", parsed.script ? `Video script:\n${parsed.script}` : "", item.notes ? `Owner's notes on it:\n${item.notes}` : "");
  }
  if (topic) parts.push(`Topic the owner wants to post about: ${topic}`);
  if (notes) parts.push(`Owner's rough notes (facts stated here may be used as facts):\n${notes}`);
  if (!parts.filter(Boolean).length) return { error: "Choose a video to start from, or type what the post should be about." };
  return { text: parts.filter(Boolean).join("\n\n").slice(0, 12000), idea: idea.slice(0, 200), niche, pillar };
}

/**
 * What has worked, for a LinkedIn post: your own LinkedIn openings that beat your usual numbers and the structures from LinkedIn posts in your swipe file,
 * scrubbed against the CRM's names in code. With no LinkedIn evidence yet it falls back to the video evidence (your hooks and outlier structures).
 */
async function linkedinEvidence(banned: string[]): Promise<string> {
  try {
    const [posts, items, swipes] = await Promise.all([
      loadPosts(),
      query<{ id: string; idea: string }>(`SELECT id, idea FROM content_items WHERE format = $1`, [LINKEDIN_FORMAT]),
      query<{ id: string; breakdown: Breakdown }>(`SELECT id, breakdown FROM creator_posts WHERE platform = 'linkedin' AND breakdown IS NOT NULL ORDER BY id DESC LIMIT 6`),
    ]);
    const ideaOf = new Map(items.map((i) => [Number(i.id), i.idea]));
    const winners = posts.filter((p) => p.platform === "linkedin" && p.performance.status === "ok" && p.performance.multiple > 1)
      .sort((a, b) => (b.performance as any).multiple - (a.performance as any).multiple).slice(0, 5)
      .map((p) => ({ hook: p.hook_used ?? ideaOf.get(p.content_item_id) ?? "", platform: "LinkedIn", x: (p.performance as any).multiple as number })).filter((w) => w.hook);
    if (!winners.length && !swipes.length) return await scriptEvidence();
    return evidenceDigest({
      winners,
      outliers: swipes.map((r) => ({ id: Number(r.id), hookType: r.breakdown.hook_type, format: r.breakdown.format, beats: r.breakdown.beats ?? [], why: r.breakdown.why_it_worked?.[0] ?? "" })),
      trends: [], pains: [],
    }, banned, 2500);
  } catch {
    return "";
  }
}

/** One LinkedIn post written by the AI and checked in code. Nothing is saved here. */
export async function draftPost(src: DraftSource): Promise<{ ok: true; draft: Draft; niche: string | null; pillar: string | null } | { ok: false; error: string }> {
  const source = await sourceBlock(src);
  if ("error" in source) return { ok: false, error: source.error };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: true, draft: EXAMPLE, niche: source.niche, pillar: source.pillar };

  const banned = await loadBanned().catch(() => [] as string[]);
  const evidence = await linkedinEvidence(banned);
  const base = `${await guide()}\n\n${await prompt("linkedin-post.md")}${evidence.trim() ? `\n\nWHAT HAS WORKED:\n${evidence.trim()}` : ""}\n\nSOURCE:\n${source.text}`;
  const schema = {
    type: "object" as const, required: ["title", "hooks", "favourite_hook", "body", "hashtags"],
    properties: { title: S, hooks: { type: "array" as const, minItems: 2, maxItems: 4, items: S }, favourite_hook: S, body: S, hashtags: { type: "array" as const, maxItems: 3, items: S } },
  };
  let problems: string[] = [], draft: Draft | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await askStructured<{ title: string; hooks: string[]; favourite_hook: string; body: string; hashtags: string[] }>(
      attempt === 0 ? base : `${base}\n\nYour last answer had these problems. Fix them and answer again in full:\n- ${problems.join("\n- ")}`, schema, linkedinModel(), 2500);
    const hooks = (Array.isArray(raw.hooks) ? raw.hooks : []).map((h) => String(h ?? "").trim()).filter(Boolean);
    const fav = String(raw.favourite_hook ?? "").trim();
    const { a, b } = pickHooks(hooks, hooks.includes(fav) ? fav : hooks[0] ?? "");
    draft = { title: String(raw.title ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || source.idea, opening: a, openingAlt: b ?? "", text: assemblePost(a, String(raw.body ?? ""), Array.isArray(raw.hashtags) ? raw.hashtags.map(String) : []) };
    problems = draftProblems(draft, banned);
    if (!problems.length) break;
  }
  if (problems.length || !draft) return { ok: false, error: `The AI's post did not pass the checks, so nothing was saved: ${problems.join("; ")}. Try again, or write it yourself.` };
  return { ok: true, draft, niche: source.niche, pillar: source.pillar };
}

/** Saves a draft as a new LinkedIn post (a content item with the LinkedIn format, straight into Drafted). Returns its id. */
export async function insertPost(d: Draft, o: { niche?: string | null; pillar?: string | null; hookType?: string | null; fromItemId?: number | null; sourceRef?: string | null; source: "generated" | "manual" | "outlier" }): Promise<number> {
  const [row] = await query<{ id: string }>(
    `INSERT INTO content_items (idea, hook, hook_alt, format, platforms, script, status, niche, pillar, hook_type, source, source_ref)
     VALUES ($1, $2, $3, $4, '{linkedin}', $5, 'Scripted', $6, $7, $8, $9, $10) RETURNING id`,
    [d.title, d.opening || null, d.openingAlt || null, LINKEDIN_FORMAT, d.text, o.niche ?? null, o.pillar ?? null, o.hookType ?? null, o.source, o.sourceRef ?? (o.fromItemId ? `linkedin:content:${o.fromItemId}` : null)]);
  return Number(row.id);
}

type RawImage = { kind?: string; title?: string; power_word?: string; items?: string[]; before?: string[]; after?: string[]; nodes?: GraphNode[]; edges?: GraphEdge[]; slides?: { heading?: string; body?: string }[]; cta?: string };

/**
 * The words for one image, chosen by the AI from the post's own text ("auto" lets it pick the kind) and checked in code:
 * any line with a figure, a guarantee or a contact detail is dropped, and if what is left is not a whole image the click is refused.
 */
export async function suggestImage(postText: string, wanted: ImageKind | "auto", size: ImageSize): Promise<{ ok: true; design: PostImage } | { ok: false; error: string }> {
  if (!postText.trim()) return { ok: false, error: "Write the post first: the image is built from its words." };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "No AI key is set, so the image wording cannot be suggested. Use Start one myself instead." };
  const L = { type: "array" as const, items: S };
  const raw = await askStructured<RawImage>(
    `${await withPositioning(await prompt("linkedin-image.md"))}\n\nKIND: ${wanted}\n\nPOST:\n${postText.slice(0, 4000)}`,
    {
      type: "object" as const, required: ["kind", "title", "power_word"],
      properties: {
        kind: { ...S, enum: IMAGE_KINDS.map((k) => k.code) }, title: S, power_word: S, items: L, before: L, after: L,
        nodes: { type: "array" as const, items: { type: "object" as const, required: ["id", "label"], properties: { id: S, label: S, decision: { type: "boolean" as const } } } },
        edges: { type: "array" as const, items: { type: "object" as const, required: ["from", "to"], properties: { from: S, to: S, label: S } } },
        slides: { type: "array" as const, items: { type: "object" as const, required: ["heading", "body"], properties: { heading: S, body: S } } },
        cta: S,
      },
    }, "haiku", 2500);
  // "Best fit" never picks a carousel: it is a different kind of post (a document), so it is only made when asked for.
  const kind = (wanted !== "auto" ? wanted : IMAGE_KINDS.some((k) => k.code === raw.kind && k.code !== "carousel") ? raw.kind : "quote") as ImageKind;
  const safe = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => String(x ?? "")).filter((x) => x.trim() && !imageTextProblem(x));
  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : []).filter((n) => !imageTextProblem(String(n?.label ?? "")));
  const edges = (Array.isArray(raw.edges) ? raw.edges : []).map((e) => (imageTextProblem(String(e?.label ?? "")) ? { ...e, label: "" } : e));
  // A slide with a figure or contact detail in it is dropped whole, like any other line; a closing line that breaks the rule is left off.
  const slides = (Array.isArray(raw.slides) ? raw.slides : []).filter((x) => !imageTextProblem(String(x?.heading ?? "")) && !imageTextProblem(String(x?.body ?? "")));
  const cta = imageTextProblem(String(raw.cta ?? "")) ? "" : raw.cta;
  const design = cleanPostImage({
    kind, size, title: raw.title, power: raw.power_word, items: safe(raw.items), before: safe(raw.before), after: safe(raw.after), slides, cta,
    code: kind === "diagram" ? mermaidFromGraph(nodes, edges) : "",
  });
  const problems = imageProblems(design);
  if (problems.length) return { ok: false, error: `The suggestion did not pass the checks, so nothing was saved: ${problems.join(" ")} Try again, pick another kind, or start one yourself.` };
  return { ok: true, design };
}
