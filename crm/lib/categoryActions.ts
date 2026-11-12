"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { slugifyNicheKey } from "./contentCategories";

export async function createCategoryAction(formData: FormData) {
  const label = String(formData.get("label") || "").trim();
  const rawKey = String(formData.get("key") || "").trim();
  const colour = String(formData.get("colour") || "var(--accent)").trim();
  if (!label) throw new Error("A category name is required");

  const key = slugifyNicheKey(rawKey || label);
  await query(
    `INSERT INTO content_categories (key, label, colour, active)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, colour = EXCLUDED.colour, active = true, updated_at = now()`,
    [key, label, colour]
  );
  revalidatePath("/content");
  revalidatePath("/content/insights");
}

export async function updateCategoryAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const label = String(formData.get("label") || "").trim();
  const colour = String(formData.get("colour") || "var(--accent)").trim();
  if (!Number.isInteger(id)) throw new Error("Invalid category");
  if (!label) throw new Error("A category name is required");

  await query(
    `UPDATE content_categories SET label = $1, colour = $2, updated_at = now() WHERE id = $3`,
    [label, colour, id]
  );
  revalidatePath("/content");
  revalidatePath("/content/insights");
}

export async function toggleCategoryActiveAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const active = formData.get("active") === "true";
  if (!Number.isInteger(id)) throw new Error("Invalid category");

  await query(
    `UPDATE content_categories SET active = $1, updated_at = now() WHERE id = $2`,
    [!active, id]
  );
  revalidatePath("/content");
  revalidatePath("/content/insights");
}
