import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isAiWritten, isStarter, starterTemplate, templateKey } from "./outreachTemplateMath.ts";

// Reading and writing prompts/outreach/<niche>.md. The key is checked first, so a niche can never point outside that folder.
const DIR = path.join(path.resolve(process.cwd(), ".."), "prompts", "outreach");
export type CopyStatus = "written" | "ai" | "starter" | "none";

export async function templateStatuses(keys: string[]): Promise<Record<string, CopyStatus>> {
  const out: Record<string, CopyStatus> = {};
  for (const k of keys) {
    const key = templateKey(k);
    let md: string | null = null;
    if (key) { try { md = await readFile(path.join(DIR, `${key}.md`), "utf8"); } catch { md = null; } }
    out[k] = md === null ? "none" : isStarter(md) ? "starter" : isAiWritten(md) ? "ai" : "written";
  }
  return out;
}

/** For a brand-new niche: creates a starter template if there is none yet. Never overwrites a file that exists. */
export async function ensureStarter(niche: string, label: string, offer: string | null): Promise<boolean> {
  const key = templateKey(niche);
  if (!key) return false;
  await mkdir(DIR, { recursive: true });
  try { await readFile(path.join(DIR, `${key}.md`)); return false; } catch { /* not there yet */ }
  await writeFile(path.join(DIR, `${key}.md`), starterTemplate(label, offer), { flag: "wx" });
  return true;
}

/** Saves new copy for a niche. The file it replaces is kept as <niche>.md.bak. */
export async function saveTemplate(niche: string, md: string): Promise<void> {
  const key = templateKey(niche);
  if (!key) throw new Error("That niche name can't be used as a file name.");
  await mkdir(DIR, { recursive: true });
  const file = path.join(DIR, `${key}.md`);
  try { await readFile(file); await rename(file, `${file}.bak`); } catch { /* nothing to back up */ }
  await writeFile(file, md);
}

export const hasTemplateFiles = async () => (await readdir(DIR).catch(() => [])).some((f) => f.endsWith(".md"));
