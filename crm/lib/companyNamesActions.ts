"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { cleanNames, describeChange, type NamesClean } from "./companyNames";

/** Saves the legal name, trading name, address and postcode of a company. Searches, research and drafts use the trading name when there is one. */
export async function saveCompanyNamesAction(companyId: number, input: { trading_name: string; name: string; address: string; postcode: string }): Promise<{ error?: string; changed?: boolean }> {
  await requireLogin();
  const [before] = await query<NamesClean>(`SELECT name, trading_name, address, postcode FROM companies WHERE id = $1`, [companyId]);
  if (!before) return { error: "Company not found." };
  const r = cleanNames(input);
  if ("error" in r) return { error: r.error };
  const change = describeChange(before, r.value);
  if (!change) return { changed: false };
  const v = r.value;
  await query(`UPDATE companies SET name = $2, trading_name = $3, address = $4, postcode = $5 WHERE id = $1`, [companyId, v.name, v.trading_name, v.address, v.postcode]);
  await logActivity("names_updated", { company_id: companyId, body: change[0].toUpperCase() + change.slice(1) });
  for (const p of ["/companies", `/companies/${companyId}`, "/"]) revalidatePath(p);
  return { changed: true };
}
