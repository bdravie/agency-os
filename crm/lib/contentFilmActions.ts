"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import { requireLogin } from "./auth";
import { scriptItem } from "./scriptItem";
import { repurposeItem } from "./repurposeItem";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Filming day: write the script for one waiting idea. The board calls this once per idea, in order, so you can see the progress. */
export async function scriptOneAction(id: number): Promise<Result> {
  await requireLogin();
  try {
    const r = await scriptItem(id, { keepExisting: true });
    if (!r.ok) return r;
    revalidatePath("/content"); revalidatePath("/content/film");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Something went wrong: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Turn one filmed video into a post for each place you publish and an Upwork portfolio blurb. Click-only. */
export async function repurposeItemAction(id: number): Promise<Result> {
  await requireLogin();
  try {
    const r = await repurposeItem(id);
    if (!r.ok) return r;
    await logActivity("content_repurposed", { body: `Repurposed into ${r.labels.join(", ")}`, meta: { content_item_id: id } });
    revalidatePath("/content");
    return { ok: true, message: `Made ${r.labels.join(", ")}. They are in Script ready.` };
  } catch (err) {
    return { ok: false, error: `Something went wrong: ${err instanceof Error ? err.message : String(err)}` };
  }
}
