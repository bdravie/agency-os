"use server";

import { revalidatePath } from "next/cache";
import { query, tx } from "./db";
import { requireLogin } from "./auth";
import { BILLING, checklistFrom, clampCredit, parseDeliverables, totals, type Billing, type CheckItem } from "./dealOffers";
import { logActivity } from "./activity";

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

export async function saveOffer(form: FormData) {
  await requireLogin();
  const id = num(form, "id");
  const billing = str(form, "billing");
  if (billing !== null && !isBilling(billing)) throw new Error("Pick a billing type.");
  const min = str(form, "price_min"), max = str(form, "price_max");
  if ((min === null) !== (max === null)) throw new Error("Set both ends of the price range, or leave both empty.");
  if (min !== null && Number(min) > Number(max)) throw new Error("The lowest price is above the highest price.");
  const duration = str(form, "duration") === null ? null : Math.round(num(form, "duration"));
  if (duration !== null && duration <= 0) throw new Error("Duration must be at least 1 day.");
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
  revalidatePath("/offers");
}

export async function addOffer(form: FormData) {
  await requireLogin();
  const name = str(form, "name");
  if (!name) return;
  const billing = str(form, "billing");
  if (billing !== null && !isBilling(billing)) throw new Error("Pick a billing type.");
  const price = num(form, "default_price");
  await query(
    `INSERT INTO offers (name, niche, outcome, setup_price_gbp, monthly_price_gbp, billing, sort_order) VALUES ($1,$2,$3,$4,$5,$6,50) ON CONFLICT (name) DO NOTHING`,
    [name, str(form, "niche"), str(form, "outcome"), billing === "monthly" ? 0 : price, billing === "monthly" ? price : 0, billing]);
  revalidatePath("/offers");
}

// ---- Offers on a deal ----

export async function addDealOffer(form: FormData) {
  await requireLogin();
  const dealId = num(form, "deal_id"), offerId = num(form, "offer_id");
  const [o] = await query<any>(`SELECT id, name, billing, setup_price_gbp, monthly_price_gbp, default_duration_days, deliverables FROM offers WHERE id = $1 AND active`, [offerId]);
  if (!o) throw new Error("Choose an offer to add.");
  if (!isBilling(o.billing)) throw new Error("That offer has no billing type yet. Set one on the Offers page first.");
  const [d] = await query<{ company_id: number | null }>(`SELECT company_id FROM deals WHERE id = $1`, [dealId]);
  if (!d) throw new Error("Deal not found.");
  const price = Number(o.billing === "monthly" ? o.monthly_price_gbp : o.setup_price_gbp);
  await query(
    `INSERT INTO deal_offers (deal_id, offer_id, billing, price_gbp, duration_days, checklist) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [dealId, offerId, o.billing, price, o.default_duration_days, JSON.stringify(checklistFrom(o.deliverables))]);
  await recomputeDeal(dealId);
  await logActivity("deal_offer_added", { company_id: d.company_id, deal_id: dealId, body: `${o.name} added (${price})` });
  refresh(dealId);
}

export async function updateDealOffer(form: FormData) {
  await requireLogin();
  const id = num(form, "id");
  const [line] = await query<any>(`SELECT id, deal_id, billing FROM deal_offers WHERE id = $1`, [id]);
  if (!line) throw new Error("Line not found.");
  const price = Math.max(0, num(form, "price"));
  const duration = str(form, "duration") === null ? null : Math.round(num(form, "duration"));
  if (duration !== null && duration <= 0) throw new Error("Duration must be at least 1 day.");
  const status = str(form, "status") ?? "planned";
  if (!["planned", "in_progress", "delivered"].includes(status)) throw new Error("Unknown status.");

  // Credit from an earlier line on the same deal (for example the audit fee against the build). Monthly lines never carry credit.
  let creditFrom: number | null = null, credit = 0;
  const fromId = str(form, "credit_from_id") === null ? null : num(form, "credit_from_id");
  if (fromId && line.billing !== "monthly") {
    const [src] = await query<any>(`SELECT id, price_gbp, billing FROM deal_offers WHERE id = $1 AND deal_id = $2 AND id <> $3`, [fromId, line.deal_id, id]);
    if (!src || src.billing === "monthly") throw new Error("Choose a one-off line on this deal to credit from.");
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
