"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { findTemplate, loadEditStyles } from "./editStyles";
import { cleanTemplate, customId, customKey, type TemplateInput } from "./editStylesMath";

// Content > Styles: saving the owner's own edit templates and choosing one for a video. Nothing here edits a video, calls an AI or sends anything.

type Result = { error?: string; key?: string; warnings?: string[] };
const refresh = () => revalidatePath("/content");

/** Saves a template built on screen: a new one (from scratch or duplicated from `basedOn`), or an update to one of the owner's own. Starter templates in the yaml are never changed from here. */
export async function saveTemplateAction(input: TemplateInput & { key?: string; basedOn?: string }): Promise<Result> {
  await requireLogin();
  const cat = await loadEditStyles();
  const r = cleanTemplate(input, cat);
  if ("error" in r) return r;
  const t = r.template;
  const taken = cat.templates.some((x) => x.name.toLowerCase() === t.name.toLowerCase() && x.key !== input.key);
  if (taken) return { error: `There is already a template called "${t.name}". Give this one its own name.` };
  const id = input.key ? customId(String(input.key)) : null;
  if (input.key && id === null) return { error: "Starter templates live in config/edit-styles.yaml. Duplicate it to make your own version." };
  const values = [t.name, t.format, t.niche, t.length, t.blurb, JSON.stringify(t.beats)];
  const rows = id === null
    ? await query<{ id: string }>(`INSERT INTO edit_templates (name, format, niche, length, blurb, beats, based_on) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING id`, [...values, String(input.basedOn ?? "").slice(0, 60) || null])
    : await query<{ id: string }>(`UPDATE edit_templates SET name = $1, format = $2, niche = $3, length = $4, blurb = $5, beats = $6::jsonb, updated_at = now() WHERE id = $7 RETURNING id`, [...values, id]);
  if (!rows.length) return { error: "That template no longer exists." };
  refresh();
  return { key: customKey(rows[0].id), warnings: r.warnings };
}

/** Deletes one of the owner's own templates. Videos set to it go back to "no template"; nothing else about them changes. */
export async function deleteTemplateAction(form: FormData): Promise<Result> {
  await requireLogin();
  const key = String(form.get("key") ?? "");
  const id = customId(key);
  if (id === null) return { error: "Starter templates cannot be deleted here. Remove it from config/edit-styles.yaml instead." };
  await query(`UPDATE content_items SET edit_template = NULL WHERE edit_template = $1`, [key]);
  await query(`DELETE FROM edit_templates WHERE id = $1`, [id]);
  refresh();
  return {};
}

/** Sets, or clears, the template a video is to be edited with. */
export async function setItemTemplateAction(form: FormData): Promise<Result> {
  await requireLogin();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { error: "That video was not found." };
  const key = String(form.get("template") ?? "").trim();
  if (key && !findTemplate(await loadEditStyles(), key)) return { error: "That template no longer exists. Pick another." };
  await query(`UPDATE content_items SET edit_template = $2 WHERE id = $1`, [id, key || null]);
  revalidatePath(`/content/${id}`);
  return {};
}
