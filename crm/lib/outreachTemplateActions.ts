"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { parse } from "yaml";
import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { draftNicheMarkdown } from "./outreachCopy";
import { listNiches } from "./leadConfig";
import { templateKey } from "./outreachTemplateMath.ts";
import { saveTemplate, templateStatuses } from "./outreachTemplates";

const ROOT = path.resolve(process.cwd(), "..");

async function nichePitch(key: string): Promise<string | null> {
  try { const y: any = parse(await readFile(path.join(ROOT, "config/niches.yaml"), "utf8")); if (y?.niches?.[key]?.offer) return String(y.niches[key].offer); } catch { /* none */ }
  try { const [r] = await query<{ offer: string | null }>(`SELECT offer FROM custom_niches WHERE key = $1`, [key]); return r?.offer ?? null; } catch { return null; }
}

/** Click-only. Writes the three outreach messages for one niche with AI, checks them against the outreach rules, and saves them to prompts/outreach/<niche>.md.
 *  A file you wrote by hand is only replaced when you say so, and the old one is kept as .bak. Nothing is sent. */
export async function writeNicheCopyAction(key: string, replaceHandWritten: boolean): Promise<{ error?: string; ok?: string }> {
  await requireLogin();
  const k = templateKey(key);
  const niche = k ? (await listNiches()).find((n) => n.key === k) : null;
  if (!k || !niche) return { error: "Niche not found." };
  const status = (await templateStatuses([k]))[k];
  if (status === "written" && !replaceHandWritten) return { error: "That niche already has copy you wrote or edited. Confirm to replace it (the old one is kept as a .bak file)." };
  const { md, problems } = await draftNicheMarkdown(niche.label, await nichePitch(k));
  if (problems.length) return { error: `The AI's copy didn't pass the outreach rules (${problems[0]}). Try again, or edit prompts/outreach/${k}.md by hand.` };
  await saveTemplate(k, `<!-- written by AI on ${new Date().toISOString().slice(0, 10)}: read it and edit it before you use it -->\n${md}\n`);
  await logActivity("outreach_copy_written", { channel: "ai", body: `Outreach copy written for ${niche.label}` });
  revalidatePath("/companies");
  return { ok: `Written for ${niche.label}. Read it in prompts/outreach/${k}.md and edit it before you use it.` };
}

export async function copyStatusesAction(keys: string[]) { await requireLogin(); return templateStatuses(keys.filter((k) => typeof k === "string").slice(0, 100)); }
