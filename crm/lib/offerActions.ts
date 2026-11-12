"use server";

import { revalidatePath } from "next/cache";
import { query, tx } from "./db";
import { requireLogin } from "./auth";
import { BILLING, checklistFrom, clampCredit, parseDeliverables, totals, type Billing, type CheckItem } from "./dealOffers";
import { cleanLines, suggestTitle } from "./dealBuilder";
import { logActivity } from "./activity";
import { isTier } from "./offerCatalogue";

const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
const num = (f: FormData, k: string) => Number(str(f, k) ?? 0) || 0;
const isBilling = (b: string | null): b is Billing => BILLING.some((x) => x.code === b);

/** A deal with offer lines gets its one-off and monthly values from them (net of credits). Deals without lines keep their typed values. */
export async function recomputeDeal(dealId: number) {
  const lines = await query<{ billing: Billing; price: string; credit: string }>(`SELECT billing, price_gbp AS price, credit_gbp AS credit FROM deal_offers WHERE deal_id = $1`, [dealId]);
  if (lines.length === 0) return;
  const t = totals(lines.map((l) => ({ billing: l.billing, price: Number(l.price), credit: Number(l.credit) })));
  await query(`UPDATE deals SET setup_value_gbp = $2, monthly_value_gbp = $3 WHERE id = $1`, [dealId, t.oneOff, t.monthly]);
}

function refresh(dealId: number) {
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  revalidatePath("/");
  revalidatePath("/funnel");
}

// ---- The offers catalogue ----

/** Puts a service or package in a tier (or takes it out). A tier holds one offer, so whichever held it before is moved out first. */
async function assignTier(id: number, form: FormData) {
  if (!form.has("tier")) return;
  const tier = str(form, "tier");
  if (tier !== null && !isTier(tier)) return;
  await tx(async (c) => {
    if (tier) await c.query(`UPDATE offers SET tier = NULL WHERE tier = $1 AND id <> $2`, [tier, id]);
    await c.query(`UPDATE offers SET tier = $2 WHERE id = $1 AND (is_bundle OR billing IS NOT NULL)`, [id, tier]);
  });
}

export async function saveOffer(form: FormData) {
  await requireLogin();
  const id = num(form, "id");
  const billing = str(form, "billing");
  if (billing !== null && !isBilling(billing)) return { error: "Pick a billing type." };
  const min = str(form, "price_min"), max = str(form, "price_max");
  if ((min === null) !== (max === null)) return { error: "Set both ends of the price range, or leave both empty." };
  if (min !== null && Number(min) > Number(max)) return { error: "The lowest price is above the highest price." };
  const duration = str(form, "duration") === null ? null : Math.round(num(form, "duration"));
  if (duration !== null && duration <= 0) return { error: "Duration must be at least 1 day." };
  // One default price for products (it is the monthly fee for a retainer); older packages keep separate setup and monthly prices.
  const dflt = str(form, "default_price") === null ? null : num(form, "default_price");
  const setup = billing ? (billing === "monthly" ? 0 : dflt ?? num(form, "setup")) : num(form, "setup");
  const monthly = billing ? (billing === "monthly" ? dflt ?? num(form, "monthly") : 0) : num(form, "monthly");
  await query(
    `UPDATE offers SET name = COALESCE($2, name), niche = $3, outcome = $4, setup_price_gbp = $5, monthly_price_gbp = $6, loom_url = $7, demo_path = $8, active = $9,
            billing = $10, price_min_gbp = $11, price_max_gbp = $12, default_duration_days = $13, deliverables = $14::jsonb WHERE id = $1`,
    [id, str(form, "name"), str(form, "niche"), str(form, "outcome"), Math.max(0, setup), Math.max(0, monthly), str(form, "loom_url"), str(form, "demo_path"), form.get("active") === "on",
     billing, min, max, duration, JSON.stringify(parseDeliverables(String(form.get("deliverables") ?? "")))],
  );
  if (billing === null) await query(`UPDATE offers SET tier = NULL WHERE id = $1 AND NOT is_bundle`, [id]);   // a tier offer must be a service or a package
  else await assignTier(id, form);
  revalidatePath("/offers");
}

export async function addOffer(form: FormData) {
  await requireLogin();
  const name = str(form, "name");
  if (!name) return;
  const billing = str(form, "billing");
  if (billing !== null && !isBilling(billing)) return { error: "Pick a billing type." };
  const price = num(form, "default_price");
  await query(
    `INSERT INTO offers (name, niche, outcome, setup_price_gbp, monthly_price_gbp, billing, sort_order) VALUES ($1,$2,$3,$4,$5,$6,50) ON CONFLICT (name) DO NOTHING`,
    [name, str(form, "niche"), str(form, "outcome"), billing === "monthly" ? 0 : price, billing === "monthly" ? price : 0, billing]);
  revalidatePath("/offers");
}

// ---- Offers on a deal ----

export async function updateDealOffer(form: FormData) {
  await requireLogin();
  const id = num(form, "id");
  const [line] = await query<any>(`SELECT id, deal_id, billing FROM deal_offers WHERE id = $1`, [id]);
  if (!line) throw new Error("Line not found.");
  const price = Math.max(0, num(form, "price"));
  const duration = str(form, "duration") === null ? null : Math.round(num(form, "duration"));
  if (duration !== null && duration <= 0) return { error: "Duration must be at least 1 day." };
  const status = str(form, "status") ?? "planned";
  if (!["planned", "in_progress", "delivered"].includes(status)) return { error: "Unknown status." };

  // Credit from an earlier line on the same deal (for example the audit fee against the build). Monthly lines never carry credit.
  let creditFrom: number | null = null, credit = 0;
  const fromId = str(form, "credit_from_id") === null ? null : num(form, "credit_from_id");
  if (fromId && line.billing !== "monthly") {
    const [src] = await query<any>(`SELECT id, price_gbp, billing FROM deal_offers WHERE id = $1 AND deal_id = $2 AND id <> $3`, [fromId, line.deal_id, id]);
    if (!src || src.billing === "monthly") return { error: "Choose a one-off line on this deal to credit from." };
    creditFrom = src.id;
    const wanted = str(form, "credit") === null ? Number(src.price_gbp) : num(form, "credit"); // blank means the full fee
    credit = clampCredit(wanted, Number(src.price_gbp), price);
  }
  await query(`UPDATE deal_offers SET price_gbp = $2, duration_days = $3, status = $4, credit_from_id = $5, credit_gbp = $6 WHERE id = $1`, [id, price, duration, status, creditFrom, credit]);
  // A cheaper price can leave a credit larger than the line: pull any credit that now exceeds its target back down.
  await query(`UPDATE deal_offers SET credit_gbp = LEAST(credit_gbp, price_gbp) WHERE deal_id = $1`, [line.deal_id]);
  await recomputeDeal(line.deal_id);
  refresh(line.deal_id);
}

export async function setChecklistItem(lineId: number, index: number, done: boolean) {
  await requireLogin();
  const [line] = await query<{ deal_id: number; checklist: CheckItem[] }>(`SELECT deal_id, checklist FROM deal_offers WHERE id = $1`, [lineId]);
  if (!line || !Number.isInteger(index) || index < 0 || index >= line.checklist.length) throw new Error("Checklist item not found.");
  const next = line.checklist.map((c, i) => (i === index ? { ...c, done } : c));
  const allDone = next.length > 0 && next.every((c) => c.done);
  await query(`UPDATE deal_offers SET checklist = $2::jsonb, status = CASE WHEN $3::boolean THEN 'delivered' WHEN status = 'delivered' THEN 'in_progress' WHEN status = 'planned' AND $4::boolean THEN 'in_progress' ELSE status END WHERE id = $1`,
    [lineId, JSON.stringify(next), allDone, next.some((c) => c.done)]);
  revalidatePath(`/deals/${line.deal_id}`);
}

export async function removeDealOffer(form: FormData) {
  await requireLogin();
  const id = num(form, "id");
  const dealId = await tx(async (c) => {
    const { rows: [line] } = await c.query(`SELECT deal_id FROM deal_offers WHERE id = $1`, [id]);
    if (!line) return null;
    // Anything credited from this line loses its credit, so the deal never keeps a discount for a fee that is gone.
    await c.query(`UPDATE deal_offers SET credit_gbp = 0, credit_from_id = NULL WHERE credit_from_id = $1`, [id]);
    await c.query(`DELETE FROM deal_offers WHERE id = $1`, [id]);
    return line.deal_id as number;
  });
  if (dealId === null) return;
  await recomputeDeal(dealId);
  refresh(dealId);
}

// ---- Packages (a named set of services) ----

async function validComponents(ids: number[]): Promise<{ ids: number[] } | { error: string }> {
  const unique = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  if (unique.length === 0) return { error: "Tick at least one service for this package." };
  const found = await query<{ id: number }>(`SELECT id FROM offers WHERE id = ANY($1::bigint[]) AND billing IS NOT NULL AND NOT is_bundle`, [unique]);
  if (found.length !== unique.length) return { error: "A package can only contain services with a billing type." };
  return { ids: unique };
}

export async function saveBundle(form: FormData) {
  await requireLogin();
  const id = num(form, "id");
  const name = str(form, "name");
  if (!name) return { error: "Give the package a name." };
  const parts = await validComponents(form.getAll("component").map(Number));
  if ("error" in parts) return parts;
  const clash = await query(`SELECT 1 FROM offers WHERE lower(name) = lower($1) AND id <> $2`, [name, id]);
  if (clash.length) return { error: "Another offer already has that name." };
  await tx(async (c) => {
    const { rowCount } = await c.query(`UPDATE offers SET name = $2, outcome = $3, active = $4 WHERE id = $1 AND is_bundle`, [id, name, str(form, "outcome"), form.get("active") === "on"]);
    if (!rowCount) throw new Error("Package not found.");
    await c.query(`DELETE FROM offer_components WHERE bundle_id = $1`, [id]);
    await c.query(`INSERT INTO offer_components (bundle_id, component_id) SELECT $1, unnest($2::bigint[])`, [id, parts.ids]);
  });
  await assignTier(id, form);
  revalidatePath("/offers");
}

export async function addBundle(form: FormData) {
  await requireLogin();
  const name = str(form, "name");
  if (!name) return { error: "Give the package a name." };
  const parts = await validComponents(form.getAll("component").map(Number));
  if ("error" in parts) return parts;
  if ((await query(`SELECT 1 FROM offers WHERE lower(name) = lower($1)`, [name])).length) return { error: "Another offer already has that name." };
  await tx(async (c) => {
    const { rows: [b] } = await c.query(`INSERT INTO offers (name, outcome, niche, is_bundle, sort_order) VALUES ($1,$2,'any',true,10) RETURNING id`, [name, str(form, "outcome")]);
    await c.query(`INSERT INTO offer_components (bundle_id, component_id) SELECT $1, unnest($2::bigint[])`, [b.id, parts.ids]);
  });
  revalidatePath("/offers");
}

// ---- Building a deal from services, packages and custom services ----

/** Confirms a deal built in the deal builder. With a dealId the lines are added to that deal; otherwise a new deal (stage New) is made for the company.
 *  Everything is saved together or not at all, and the one-off and monthly values are set from the lines. */
export async function confirmDeal(input: { dealId?: number | null; companyId?: number | null; title?: string; lines: unknown }): Promise<{ id?: number; error?: string }> {
  await requireLogin();
  const offerIds = Array.isArray(input.lines) ? (input.lines as { offerId?: unknown }[]).map((l) => Number(l.offerId)).filter((n) => Number.isInteger(n) && n > 0) : [];
  const catalogue = offerIds.length
    ? await query<{ id: number; billing: string | null; deliverables: unknown; default_duration_days: number | null }>(
        `SELECT id, billing, deliverables, default_duration_days FROM offers WHERE id = ANY($1::bigint[]) AND active AND NOT is_bundle`, [offerIds])
    : [];
  const cleaned = cleanLines(input.lines, new Map(catalogue.filter((o) => o.billing).map((o) => [Number(o.id), o.billing as string])));
  if ("error" in cleaned) return cleaned;
  const byId = new Map(catalogue.map((o) => [Number(o.id), o]));

  let dealId = Number(input.dealId) || 0, companyId: number | null = null;
  if (dealId) {
    const [d] = await query<{ company_id: number | null }>(`SELECT company_id FROM deals WHERE id = $1`, [dealId]);
    if (!d) return { error: "That deal no longer exists." };
    companyId = d.company_id;
  } else {
    companyId = Number(input.companyId) || 0;
    if (!companyId || !(await query(`SELECT 1 FROM companies WHERE id = $1`, [companyId])).length) return { error: "Pick a company for this deal." };
  }
  const title = (input.title ?? "").trim().slice(0, 120)
    || suggestTitle(cleaned.lines.map((l) => ({ name: l.customName ?? "", bundleName: l.bundleName })));

  dealId = await tx(async (c) => {
    if (!dealId) {
      const { rows: [d] } = await c.query(
        `INSERT INTO deals (company_id, title, source, channel)
         VALUES ($1,$2,'deal_builder',(SELECT CASE type WHEN 'email_logged' THEN 'email' ELSE 'social_dm' END FROM activities WHERE company_id = $1 AND type IN ('email_logged','dm_logged') ORDER BY occurred_at LIMIT 1)) RETURNING id`,
        [companyId, title || "New deal"]);
      dealId = d.id as number;
    }
    for (const l of cleaned.lines) {
      const o = l.offerId ? byId.get(l.offerId) : undefined;
      await c.query(
        `INSERT INTO deal_offers (deal_id, offer_id, custom_name, bundle_name, billing, price_gbp, duration_days, checklist) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [dealId, l.offerId, l.customName, l.bundleName, l.billing, l.price, l.durationDays ?? o?.default_duration_days ?? null, JSON.stringify(checklistFrom(o?.deliverables))]);
    }
    const { rows } = await c.query(`SELECT billing, price_gbp AS price, credit_gbp AS credit FROM deal_offers WHERE deal_id = $1`, [dealId]);
    const t = totals(rows.map((r) => ({ billing: r.billing as Billing, price: Number(r.price), credit: Number(r.credit) })));
    await c.query(`UPDATE deals SET setup_value_gbp = $2, monthly_value_gbp = $3 WHERE id = $1`, [dealId, t.oneOff, t.monthly]);
    return dealId;
  });

  const added = input.dealId ? "added to the deal" : "deal created";
  await logActivity(input.dealId ? "deal_offer_added" : "deal_created", { company_id: companyId, deal_id: dealId, body: `${title || "Services"}: ${cleaned.lines.length} line(s) ${added}` });
  if (companyId) revalidatePath(`/companies/${companyId}`);
  revalidatePath("/deals"); revalidatePath("/"); revalidatePath("/funnel");
  refresh(dealId);
  return { id: dealId };
}
