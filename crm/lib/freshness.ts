import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { query } from "./db";
import { containsContactDetails } from "./audit";
import { mentionsAny } from "./ideaEvidenceMath";
import { parseScript } from "./filmMath";
import { closestPosts, parsePhraseConfig, usedDigest, type Earlier, type FreshRules } from "./freshnessMath";

// What every post-drafting step needs to keep a post fresh: the guidance the AI reads (prompts/content-freshness.md), the owner's stock-phrase list
// (config/content-phrases.yaml) and the wording of earlier posts. The rules themselves are in freshnessMath.ts.

const root = () => (existsSync(path.join(process.cwd(), "prompts")) ? process.cwd() : path.resolve(process.cwd(), ".."));
/** A Upwork blurb is not a post, so it is neither checked nor counted as earlier wording. */
const NOT_A_POST = "Upwork portfolio blurb";

/** Earlier posts, newest first: every video script, caption and LinkedIn post that is not archived, apart from the ones being written now. */
export async function loadEarlier(excludeIds: number[] = []): Promise<Earlier[]> {
  const rows = await query<{ id: string; idea: string; hook: string | null; hook_alt: string | null; script: string | null; caption: string | null }>(
    `SELECT id, idea, hook, hook_alt, script, caption FROM content_items
      WHERE status <> 'Archived' AND format IS DISTINCT FROM $2 AND id <> ALL($1::bigint[])
        AND (script IS NOT NULL OR caption IS NOT NULL OR hook IS NOT NULL)
      ORDER BY id DESC LIMIT 300`, [excludeIds, NOT_A_POST]);
  return rows.map((r) => {
    const hooks = [r.hook, r.hook_alt].map((h) => (h ?? "").trim()).filter(Boolean);
    // The spoken script only: the unused hook options and the shot list were never posted.
    return { id: Number(r.id), title: String(r.idea).slice(0, 60), hooks, text: [...hooks, parseScript(r.script).script, r.caption ?? ""].filter(Boolean).join("\n") };
  });
}

export type Freshness = { rules: FreshRules; /** Appended to the prompt: the guidance and the lines already used. */ block: string };

/**
 * The freshness rules for one drafting step. `excludeIds` are posts whose wording may be reused: the post being rewritten, or the video a caption sits under.
 * `banned` are the CRM's business and contact names, so a line naming one is never shown to the AI.
 * `about` is what is about to be written (the idea, topic and notes): the earlier posts closest to it are shown to the AI in full.
 */
export async function loadFreshness(excludeIds: number[] = [], banned: string[] = [], about = ""): Promise<Freshness> {
  const [guidance, phrases, earlier] = await Promise.all([
    readFile(path.join(root(), "prompts/content-freshness.md"), "utf8"),
    readFile(path.join(root(), "config/content-phrases.yaml"), "utf8").then((t) => parsePhraseConfig(parse(t))),
    loadEarlier(excludeIds),
  ]);
  const hidden = (line: string) => containsContactDetails(line) || !!mentionsAny(line, banned);
  const used = usedDigest(earlier.slice(0, 40), hidden);
  const close = closestPosts(earlier, about).map((e, i) =>
    `EARLIER POST ${i + 1}:\n${e.text.split("\n").filter((l) => l.trim() && !hidden(l)).join("\n").slice(0, 1800)}`).join("\n\n");
  return {
    rules: { ...phrases, earlier },
    block: `${guidance.trim()}\n\nALREADY USED (lines from earlier posts; never reuse or lightly reword them):\n${used || "(nothing yet)"}` +
      (close ? `\n\nEARLIER POSTS ON A SIMILAR SUBJECT, IN FULL. The app compares your draft with these word by word: no run of four words may match, including the name you give to what was built, the list of what it does and the closing question. Describe the same things in new words, from the new angle.\n\n${close}` : ""),
  };
}
