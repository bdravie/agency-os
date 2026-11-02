import { readFile } from "node:fs/promises";
import path from "node:path";
import { query } from "./db";
import { askStructured } from "./llm";
import { guide, loadContentConfig } from "./content";
import { VARIANT_LABEL, parseScript, variantProblems, variantTargets, type Variant } from "./filmMath";

/**
 * One filmed video becomes a post for each place you publish (Reels, LinkedIn, TikTok, Shorts as configured) plus an Upwork portfolio blurb.
 * Each is saved as its own linked content item (source "repurpose", pointing back to the original). Checked in code and asked again once if it fails.
 */
export async function repurposeItem(id: number): Promise<{ ok: true; labels: string[] } | { ok: false; error: string }> {
  const [item] = await query<any>(`SELECT id, idea, hook, script, caption, keyword, status, pillar, hook_type, niche FROM content_items WHERE id = $1`, [id]);
  if (!item) return { ok: false, error: "That idea no longer exists." };
  if (!["Filmed", "Posted"].includes(item.status)) return { ok: false, error: "Repurpose a video once it has been filmed." };
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM content_items WHERE source = 'repurpose' AND source_ref = $1`, [`content:${id}`]);
  if (Number(n) > 0) return { ok: false, error: `This one has already been repurposed (${n} items). Delete those first if you want to redo it.` };
  const config = await loadContentConfig();
  const targets = variantTargets(config.platforms);
  const rules = await readFile(path.join(path.resolve(process.cwd(), ".."), "prompts/repurpose-item.md"), "utf8");
  const parsed = parseScript(item.script);
  const prompt = `${await guide()}\n\n${rules}\n\nTARGETS: ${targets.map((t) => `${t} (${VARIANT_LABEL[t]})`).join(", ")}\n\nORIGINAL:\nIdea: ${item.idea}\nHook: ${item.hook ?? "(none)"}\nKeyword viewers comment: ${item.keyword ?? "(none)"}\nCaption: ${item.caption ?? "(none)"}\nScript:\n${parsed.script || "(none)"}`;
  const S = { type: "string" } as const;
  const schema = { type: "object" as const, required: ["variants"], properties: { variants: { type: "array", minItems: targets.length, maxItems: targets.length, items: { type: "object", required: ["target", "text"], properties: { target: { type: "string", enum: targets }, text: S } } } } };
  let problems: string[] = [], variants: Variant[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await askStructured<{ variants: Variant[] }>(attempt === 0 ? prompt : `${prompt}\n\nYour last answer had these problems. Fix them and answer again in full:\n- ${problems.join("\n- ")}`, schema, "sonnet", 3500);
    variants = (raw.variants ?? []).map((v) => ({ target: String(v.target), text: String(v.text ?? "").trim() }));
    problems = variantProblems(variants, targets);
    if (!problems.length) break;
  }
  if (problems.length) return { ok: false, error: `The AI's answer did not pass the checks, so nothing was saved: ${problems.join("; ")}. Try again.` };
  for (const v of variants) {
    const social = ["instagram", "tiktok", "youtube"].includes(v.target);
    await query(
      `INSERT INTO content_items (idea, hook, format, platforms, script, caption, keyword, status, pillar, hook_type, niche, source, source_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Scripted',$8,$9,$10,'repurpose',$11)`,
      [`${item.idea} [${VARIANT_LABEL[v.target]}]`, item.hook, VARIANT_LABEL[v.target], v.target === "upwork" ? [] : [v.target], v.text, social ? v.text : null, item.keyword, item.pillar, item.hook_type, item.niche, `content:${id}`]);
  }
  return { ok: true, labels: variants.map((v) => VARIANT_LABEL[v.target]) };
}
