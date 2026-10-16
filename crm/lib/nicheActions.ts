"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { containsContactDetails } from "./audit";
import { listNiches } from "./leadConfig";
import { nicheKey, parseSicCodes, parseTerms } from "./niche";

// Niches you add in the CRM live in the custom_niches table (the ones in config/niches.yaml stay in that file).

export type NicheState = { ok?: string; error?: string } | null;

/** Asks Companies House how many active ltd/llp/plc companies use these SIC codes, so a wrong code is caught before it is saved. Free. */
export async function checkSicAction(text: string): Promise<{ hits?: number; error?: string; codes?: string[] }> {
  await requireLogin();
  const { codes, bad } = parseSicCodes(text);
  if (bad.length) return { error: `Not a 5-digit SIC code: ${bad.slice(0, 4).join(", ")}` };
  if (codes.length === 0) return { error: "Enter at least one 5-digit SIC code, e.g. 43220." };
  const key = process.env.COMPANIES_HOUSE_API_KEY?.trim();
  if (!key) return { error: "The server can't see COMPANIES_HOUSE_API_KEY, so the codes can't be checked. You can still save the niche." };
  try {
    const url = `https://api.company-information.service.gov.uk/advanced-search/companies?sic_codes=${codes.join(",")}&company_status=active&company_type=ltd,llp,plc&size=1`;
    const res = await fetch(url, { headers: { authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { error: `Companies House answered ${res.status}. Try again shortly.` };
    return { hits: Number((await res.json()).hits ?? 0), codes };
  } catch { return { error: "Couldn't reach Companies House to check. You can still save the niche." }; }
}

export async function addNicheAction(_prev: NicheState, form: FormData): Promise<NicheState> {
  await requireLogin();
  const label = String(form.get("label") ?? "").trim();
  const key = nicheKey(label);
  if (!key || label.length < 2 || label.length > 60) return { error: "Give the niche a short name, e.g. Dental practices." };
  const { codes, bad } = parseSicCodes(String(form.get("sic") ?? ""));
  if (bad.length) return { error: `Not a 5-digit SIC code: ${bad.slice(0, 4).join(", ")}` };
  if (codes.length === 0 || codes.length > 8) return { error: "Enter 1 to 8 SIC codes, each 5 digits (e.g. 43220)." };
  const terms = parseTerms(String(form.get("terms") ?? "")), offer = String(form.get("offer") ?? "").trim() || null;
  if (containsContactDetails(label) || containsContactDetails(offer)) return { error: "Keep this to business wording, without emails or phone numbers." };
  if ((await listNiches()).some((n) => n.key === key)) return { error: `There is already a niche called “${key.replace(/_/g, " ")}”.` };
  await query(`INSERT INTO custom_niches (key, label, sic_codes, search_terms, offer) VALUES ($1,$2,$3,$4,$5)`, [key, label, codes, terms, offer?.slice(0, 300) ?? null]);
  revalidatePath("/companies");
  return { ok: `Added “${label}”. It is now in the niche list.` };
}

export async function deleteNicheAction(form: FormData): Promise<void> {
  await requireLogin();
  await query(`DELETE FROM custom_niches WHERE key = $1`, [String(form.get("key") ?? "")]);   // companies already saved under it keep their niche text
  revalidatePath("/companies");
}
