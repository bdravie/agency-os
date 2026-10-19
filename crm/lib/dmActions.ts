"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { assertSendable } from "./complianceGate";
import { askStructured, dmModel } from "./llm";
import { buildFacts } from "./offerSuggest";
import { companyChangedSince, latestResearch } from "./research";
import { finishDm, type DmDraft } from "./dmDraft";

// Drafts a first Instagram DM and one follow-up from the saved research. Nothing is sent: you copy it, send it yourself, then mark it sent.
// Runs only on click, for a company that passes the lead gate and has an Instagram company page saved, within a daily cap.
export type DmResult = { draft?: DmDraft; model?: string; error?: string };

const S = { type: "string" } as const;
const SCHEMA = {
  type: "object", required: ["first_dm", "follow_up", "finding_ids", "check_first"],
  properties: { first_dm: S, follow_up: S, finding_ids: { type: "array", items: S }, check_first: { type: "array", items: S } },
} as const;

export async function draftInstagramDmAction(companyId: number): Promise<DmResult> {
  await requireLogin();
  try {
    await assertSendable(companyId);
    const sender = process.env.SENDER_NAME?.trim(), business = process.env.BUSINESS_NAME?.trim();
    if (!sender || !business) return { error: "Set SENDER_NAME and BUSINESS_NAME in .env first. Every message carries your real name and business name." };
    const cap = Number(process.env.DM_DAILY_CAP ?? 30) || 30;
    const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'dm_drafted' AND occurred_at::date = current_date`);
    if (Number(n) >= cap) return { error: `Daily cap of ${cap} AI DM drafts reached. Try again tomorrow.` };
    const [c] = await query<{ instagram_url: string | null }>(`SELECT instagram_url FROM companies WHERE id = $1`, [companyId]);
    if (!c?.instagram_url) return { error: "Save this company's Instagram page first (Contact details)." };
    const research = await latestResearch(companyId);
    if (!research) return { error: "Run the research first (it's free). The message is built from what it found on their website." };
    const [co] = await query<{ name: string }>(`SELECT name FROM companies WHERE id = $1`, [companyId]);
    const [sug] = await query<{ result: any }>(`SELECT result FROM offer_suggestions WHERE company_id = $1 ORDER BY id DESC LIMIT 1`, [companyId]);
    const rules = await readFile(path.join(path.resolve(process.cwd(), ".."), "prompts", "instagram-dm.md"), "utf8");
    const facts = await buildFacts(companyId, research);
    const idea = sug?.result?.suggestions?.[0];
    const earlier = idea ? `\n\nEARLIER OFFER IDEA (for the kind of automation to mention): ${idea.title}. ${idea.automation}` : "";
    const model = dmModel();
    const raw = await askStructured<unknown>(`${rules}\n\nCOMPANY NAME FOR THE GREETING: ${co.name.replace(/[.,]?\s+(limited|ltd\.?|llp|plc)$/i, "").trim()}\n\n${facts.text}${earlier}`, SCHEMA as never, model, 1200);
    const draft = finishDm(raw, { sender, business }, facts.findingIds);
    if (await companyChangedSince(companyId, research)) draft.warnings.push("This company was edited after the research ran, so run the research again if the message looks out of date.");
    await logActivity("dm_drafted", { company_id: companyId, channel: "dm", body: `Instagram DM drafted (${model})` });
    return { draft, model };
  } catch (err) { return { error: err instanceof Error ? err.message : String(err) }; }
}
