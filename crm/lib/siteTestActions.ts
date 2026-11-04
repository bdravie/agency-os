"use server";

import { revalidatePath } from "next/cache";
import { requireLogin } from "./auth";
import { refreshSiteStats } from "./siteTests";

/** Click-only. Copies the latest anonymous counts from the public site. Free. */
export async function refreshSiteStatsAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireLogin();
  const r = await refreshSiteStats();
  if (r.ok) revalidatePath("/site-tests");
  return r;
}
