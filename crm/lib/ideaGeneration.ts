import { readFile } from "node:fs/promises";
import path from "node:path";
import { query } from "./db";
import { askStructured, contentModel } from "./llm";
import { guide, loadContentConfig } from "./content";
import { loadInsights } from "./contentInsights";
import { nicheAudience } from "./contentConfigMath";
import { HOOK_TYPES, PILLARS } from "./contentMath";
import { numbersNotIn } from "./insightsMath";
import {
  anonymisedPains, bannedTerms, cleanGenerated, cleanScores, evidenceDigest, pillarMix, pipelineProblems,
  type Evidence, type NewIdea, type PipelineFacts,
} from "./ideaEvidenceMath";
import type { Breakdown } from "./breakdownMath";
import { parse } from "yaml";

const ROOT = path.resolve(process.cwd(), "..");
const S = { type: "string" } as const;
const read = (f: string) => readFile(path.join(ROOT, f), "utf8");

/** Names, domains and contacts in the CRM that must never reach the AI. */
export async function loadBanned(): Promise<string[]> {
  const [cos, cons] = await Promise.all([
    query<any>(`SELECT name, trading_name, domain FROM companies`),
    query<{ name: string | null }>(`SELECT name FROM contacts`),
  ]);
  return bannedTerms(cos, cons.map((c) => c.name));
}

/** The evidence for a batch: your best posts, unused outlier structures, trends you noted, and gaps seen across many businesses (anonymised in code). */
export async function loadEvidence(niche: string | null, banned: string[]): Promise<{ evidence: Evidence; digest: string; ids: { trends: Set<number>; outliers: Set<number>; pains: number; winners: number } }> {
  const [ins, outlierRows, trendRows, findingRows] = await Promise.all([
    loadInsights("all"),
    query<{ id: string; breakdown: Breakdown }>(`SELECT id, breakdown FROM creator_posts WHERE breakdown IS NOT NULL ORDER BY id DESC LIMIT 30`),
    query<any>(`SELECT id, title, detail FROM trend_signals WHERE used_in_content_id IS NULL AND seen_at > now() - interval '14 days' AND ($1::text IS NULL OR niche IS NULL OR niche = $1) ORDER BY seen_at DESC LIMIT 8`, [niche]),
    query<any>(
      `SELECT r.company_id, f->>'kind' AS kind, f->>'area' AS area, f->>'title' AS title
         FROM company_research r JOIN companies c ON c.id = r.company_id, jsonb_array_elements(r.findings) f
        WHERE r.created_at > now() - interval '30 days' AND ($1::text IS NULL OR c.niche = $1)`, [niche]),
  ]);
  const evidence: Evidence = {
    winners: ins.top.slice(0, 5).map((p) => ({ hook: p.hookUsed ?? p.idea, platform: p.platform, x: p.multiple })),
    outliers: outlierRows.filter((r) => r.breakdown.ideas.some((i) => !i.content_id)).slice(0, 10)
      .map((r) => ({ id: Number(r.id), hookType: r.breakdown.hook_type, format: r.breakdown.format, beats: r.breakdown.beats, why: r.breakdown.why_it_worked[0] ?? "" })),
    trends: trendRows.map((t: any) => ({ id: Number(t.id), title: t.title, detail: t.detail })),
    pains: anonymisedPains(findingRows.map((r: any) => ({ company_id: Number(r.company_id), kind: r.kind, area: r.area, title: r.title })), banned),
  };
  return {
    evidence, digest: evidenceDigest(evidence, banned),
    ids: { trends: new Set(evidence.trends.map((t) => t.id)), outliers: new Set(evidence.outliers.map((o) => o.id)), pains: evidence.pains.length, winners: evidence.winners.length },
  };
}

/**
 * Ten ideas (or `count`) made from evidence: spread across the weekly pillar mix, tagged with niche, pillar and hook type, and saying what each is built on.
 * `niche` makes every idea for that one niche; otherwise the AI spreads them across your content niches.
 */
export async function generateEvidenceIdeas(o: { niche: string | null; steer: string | null; existing: string[]; count?: number }): Promise<{ ideas: NewIdea[]; dropped: number; evidenceItems: number }> {
  const count = o.count ?? 10;
  const config = await loadContentConfig();
  const niches = o.niche ? [o.niche] : config.niches;
  const table = parse(await read("config/niches.yaml"))?.niches;
  const banned = await loadBanned();
  const ev = await loadEvidence(o.niche, banned);
  const audience = o.niche ? nicheAudience(o.niche, table) : undefined;
  const mix = pillarMix(count);
  const prompt =
    `${await guide(audience)}\n\n${await read("prompts/content-ideas.md")}\n\n` +
    `NICHES ALLOWED: ${niches.join(", ")}${o.niche ? " (every idea is for this niche)" : ""}\n` +
    `NUMBER OF IDEAS: ${count}\nPILLAR MIX: ${Object.entries(mix).filter(([, n]) => n > 0).map(([p, n]) => `${n} x ${p}`).join(", ")}\n` +
    (o.steer ? `OWNER'S STEER FOR THIS BATCH: ${o.steer}\n` : "") +
    `\nEVIDENCE:\n${ev.digest || "(none yet: you have no posts, outliers, trends or research patterns to draw on, so write from the guide alone and use kind \"generated\")"}\n\n` +
    `EXISTING:\n${o.existing.map((e) => `- ${e}`).join("\n") || "(none)"}`;
  const schema = {
    type: "object" as const, required: ["ideas"],
    properties: { ideas: { type: "array", minItems: 1, maxItems: count + 2, items: {
      type: "object", required: ["idea", "hook", "pillar", "hook_type", "niche", "based_on"],
      properties: {
        idea: S, hook: S, pillar: { type: "string", enum: [...PILLARS] }, hook_type: { type: "string", enum: [...HOOK_TYPES] }, niche: { type: "string", enum: niches },
        based_on: { type: "object", required: ["kind", "ref"], properties: { kind: { type: "string", enum: ["generated", "winner", "trend", "outlier", "pipeline"] }, ref: { type: ["string", "null"] } } },
      } } } },
  };
  let best = { ideas: [] as NewIdea[], dropped: 0 };
  for (let attempt = 0; attempt < 2 && best.ideas.length < Math.ceil(count * 0.7); attempt++) {
    const raw = await askStructured<unknown>(prompt, schema, contentModel(), 5000);
    const r = cleanGenerated(raw, niches, ev.ids, o.existing, o.niche);
    if (r.ideas.length > best.ideas.length) best = r;
  }
  return { ideas: best.ideas.slice(0, count), dropped: best.dropped, evidenceItems: ev.evidence.winners.length + ev.evidence.outliers.length + ev.evidence.trends.length + ev.evidence.pains.length };
}

/** Haiku scores each new idea 1 to 10 with a one-line reason, against your winners. A failure to score never loses the ideas: they are just left unscored. */
export async function scoreNewIdeas(ideas: NewIdea[]): Promise<({ score: number; reason: string } | null)[]> {
  if (!ideas.length) return [];
  try {
    const ins = await loadInsights("all");
    const winners = ins.top.slice(0, 5).map((p) => `- "${p.hookUsed ?? p.idea}" (${p.multiple}× your usual)`).join("\n");
    const prompt = `${await guide()}\n\n${await read("prompts/idea-score.md")}\n\nYOUR WINNERS:\n${winners || "(none yet)"}\n\nIDEAS:\n${ideas.map((i, k) => `${k}. [${i.niche}, ${i.pillar}] ${i.hook}: ${i.idea}`).join("\n")}`;
    const raw = await askStructured<unknown>(prompt, {
      type: "object" as const, required: ["scores"],
      properties: { scores: { type: "array", items: { type: "object", required: ["index", "score", "reason"], properties: { index: { type: "integer" }, score: { type: "integer", minimum: 1, maximum: 10 }, reason: S } } } },
    }, contentModel(), 3000);
    return cleanScores(raw, ideas.length);
  } catch { return ideas.map(() => null); }
}

/** What the pipeline step may know about one deal: the kind of business, how many of that kind were researched, and the generic gaps with counts. Never a name. */
export async function loadPipelineFacts(dealId: number): Promise<{ facts: PipelineFacts; banned: string[]; niche: string } | { error: string }> {
  const [deal] = await query<any>(`SELECT d.id, c.id AS company_id, c.niche FROM deals d JOIN companies c ON c.id = d.company_id WHERE d.id = $1`, [dealId]);
  if (!deal) return { error: "That deal has no company." };
  const config = await loadContentConfig();
  const niche = deal.niche && config.niches.includes(deal.niche) ? deal.niche : config.niches[0];
  const [mine] = await query<any>(`SELECT findings FROM company_research WHERE company_id = $1 ORDER BY id DESC LIMIT 1`, [deal.company_id]);
  const gaps: { area: string; title: string }[] = (mine?.findings ?? []).filter((f: any) => f.kind === "gap" && f.title && f.area).slice(0, 5).map((f: any) => ({ area: f.area, title: f.title }));
  if (!gaps.length) return { error: "This deal's company has no research gaps saved. Run the research on its company page first." };
  const all = await query<any>(
    `SELECT DISTINCT ON (r.company_id) r.company_id, r.findings FROM company_research r JOIN companies c ON c.id = r.company_id
      WHERE c.niche = $1 AND r.created_at > now() - interval '90 days' ORDER BY r.company_id, r.id DESC`, [deal.niche ?? niche]);
  const researched = all.length || 1;
  const facts: PipelineFacts = { niche, researched, gaps: gaps.map((g) => ({ ...g, withGap: all.filter((r: any) => (r.findings ?? []).some((f: any) => f.kind === "gap" && f.title === g.title)).length || 1 })) };
  return { facts, banned: await loadBanned(), niche };
}

/** Three ideas that name a pattern found in one deal's research without ever naming the business. Checked in code and asked again once if it fails. */
export async function pipelineIdeas(dealId: number): Promise<{ ideas?: NewIdea[]; error?: string }> {
  const loaded = await loadPipelineFacts(dealId);
  if ("error" in loaded) return { error: loaded.error };
  const { facts, banned, niche } = loaded;
  const text = `KIND OF BUSINESS: ${facts.niche.replace(/_/g, " ")}\nBUSINESSES RESEARCHED OF THIS KIND: ${facts.researched}\n` + facts.gaps.map((g) => `GAP: ${g.area}: ${g.title} (found at ${g.withGap} of those ${facts.researched})`).join("\n");
  const schema = {
    type: "object" as const, required: ["ideas"],
    properties: { ideas: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", required: ["idea", "hook", "pillar", "hook_type"], properties: { idea: S, hook: S, pillar: { type: "string", enum: ["Niche pain", "Build in public"] }, hook_type: { type: "string", enum: [...HOOK_TYPES] } } } } },
  };
  const prompt = `${await guide()}\n\n${await read("prompts/pipeline-ideas.md")}\n\nFACTS:\n${text}`;
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await askStructured<{ ideas: { idea: string; hook: string; pillar: string; hook_type: string }[] }>(attempt === 0 ? prompt : `${prompt}\n\nYour last answer had these problems. Fix them:\n- ${problems.join("\n- ")}`, schema, contentModel(), 4000);
    const ideas = (raw.ideas ?? []).map((i) => ({ idea: String(i.idea ?? "").trim(), hook: String(i.hook ?? "").trim(), pillar: i.pillar, hook_type: i.hook_type }));
    problems = pipelineProblems(ideas, banned, text);
    if (!problems.length && numbersNotIn(ideas.map((i) => `${i.idea} ${i.hook}`).join("\n"), text).length === 0) {
      return { ideas: ideas.map((i) => ({ ...i, niche, source: "pipeline", source_ref: `deal:${dealId}` })) };
    }
  }
  return { error: `The ideas did not pass the privacy checks, so none were saved: ${problems.join("; ") || "a number was used that was not in the facts"}. Try again.` };
}
