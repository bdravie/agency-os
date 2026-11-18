import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { query } from "./db";
import { customId, customKey, parseCatalogue, type Beat, type Catalogue, type Template } from "./editStylesMath";

// Content > Styles, server side: the catalogue from config/edit-styles.yaml plus the owner's own templates from the database.
// Read-only. The CRM edits no video and sends nothing; a template only shapes the brief the owner copies to Claude.

function root(): string {
  if (existsSync(path.join(process.cwd(), "config"))) return process.cwd();
  return path.resolve(process.cwd(), "..");
}

/** The yaml catalogue, with the owner's saved templates added after the starter ones. A missing table (migration not run yet) just means no saved templates. */
export async function loadEditStyles(): Promise<Catalogue> {
  const cat = parseCatalogue(parse(await readFile(path.join(root(), "config/edit-styles.yaml"), "utf8")));
  const rows = await query<any>(`SELECT id, name, format, niche, length, blurb, beats FROM edit_templates ORDER BY lower(name), id`).catch(() => []);
  // Saved beats pass through the same reader as the yaml's, so an element since removed from the catalogue drops out instead of breaking the page.
  const saved = parseCatalogue({
    groups: cat.groups, elements: cat.elements,
    templates: rows.map((r) => ({ key: `saved_${r.id}`, name: r.name, format: r.format, niche: r.niche, length: r.length, blurb: r.blurb, beats: r.beats as Beat[] })),
  }).templates.map((t): Template => ({ ...t, key: customKey(t.key.replace("saved_", "")), custom: true }));
  return { ...cat, templates: [...cat.templates, ...saved] };
}

/** The template a video is set to, or null when none is chosen or it no longer exists. */
export const findTemplate = (cat: Catalogue, key: string | null | undefined): Template | null => (key ? cat.templates.find((t) => t.key === key) ?? null : null);

export { customId };
