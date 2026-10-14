"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query } from "./db";
import { requireLogin } from "./auth";
import { normaliseDomain, parseCsv } from "./csv";
import { STAGES } from "./stages";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const num = (f: FormData, k: string) => Number(str(f, k) ?? 0) || 0;

export async function logActivity(
  type: string, o: { company_id?: number | null; contact_id?: number | null; deal_id?: number | null; channel?: string | null; body?: string | null } = {},
) {
  await query(
    `INSERT INTO activities (company_id, contact_id, deal_id, type, channel, body) VALUES ($1,$2,$3,$4,$5,$6)`,
    [o.company_id ?? null, o.contact_id ?? null, o.deal_id ?? null, type, o.channel ?? null, o.body ?? null],
  );
}

export async function createCompany(form: FormData) {
  await requireLogin();
  const name = str(form, "name");
  if (!name) return;
  const domain = normaliseDomain(str(form, "domain"));
  const rows = await query<{ id: number }>(
    `INSERT INTO companies (name, domain, phone, niche, source)
     VALUES ($1,$2,$3,$4,'manual')
     ON CONFLICT (lower(domain)) WHERE domain IS NOT NULL DO UPDATE SET name = companies.name
     RETURNING id`,
    [name, domain, str(form, "phone"), str(form, "niche")],
  );
  await logActivity("company_added", { company_id: rows[0].id, body: name });
  redirect(`/companies/${rows[0].id}`);
}

export async function saveNotes(form: FormData) {
  await requireLogin();
  const id = num(form, "company_id");
  await query(`UPDATE companies SET owner_notes = $1, status = COALESCE($2, status) WHERE id = $3`, [str(form, "notes"), str(form, "status"), id]);
  revalidatePath(`/companies/${id}`);
}

export async function addContact(form: FormData) {
  await requireLogin();
  const company_id = num(form, "company_id");
  const name = str(form, "name");
  const consent = str(form, "consent_basis");
  if (!name || !consent) return; // contacts need a recorded reason they engaged
  const rows = await query<{ id: number }>(
    `INSERT INTO contacts (company_id, name, role, email, phone, consent_basis) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [company_id, name, str(form, "role"), str(form, "email"), str(form, "phone"), consent],
  );
  await logActivity("contact_added", { company_id, contact_id: rows[0].id, body: `${name} (${consent})` });
  revalidatePath(`/companies/${company_id}`);
}

export async function addDeal(form: FormData) {
  await requireLogin();
  const company_id = num(form, "company_id");
  const title = str(form, "title");
  if (!title) return;
  const rows = await query<{ id: number }>(
    `INSERT INTO deals (company_id, title, setup_value_gbp, monthly_value_gbp, source) VALUES ($1,$2,$3,$4,'manual') RETURNING id`,
    [company_id, title, num(form, "setup"), num(form, "monthly")],
  );
  await logActivity("deal_created", { company_id, deal_id: rows[0].id, body: title });
  revalidatePath(`/companies/${company_id}`);
}

export async function addTask(form: FormData) {
  await requireLogin();
  const company_id = num(form, "company_id");
  const title = str(form, "title");
  if (!title) return;
  await query(`INSERT INTO tasks (title, due_at, company_id) VALUES ($1,$2,$3)`, [title, str(form, "due"), company_id]);
  revalidatePath(`/companies/${company_id}`);
  revalidatePath("/");
}

export async function completeTask(form: FormData) {
  await requireLogin();
  await query(`UPDATE tasks SET done_at = now() WHERE id = $1`, [num(form, "task_id")]);
  revalidatePath("/", "layout");
}

const LOG_TYPES = new Set(["email", "dm", "call", "note"]);
export async function logContact(form: FormData) {
  await requireLogin();
  const company_id = num(form, "company_id");
  const type = str(form, "type") ?? "note";
  if (!LOG_TYPES.has(type)) return;
  await logActivity(`${type}_logged`, { company_id, channel: type, body: str(form, "body") });
  revalidatePath(`/companies/${company_id}`);
}

export type ImportResult = { created: number; merged: number; skipped: number; message?: string };

export async function importCompanies(_prev: ImportResult | null, form: FormData): Promise<ImportResult> {
  await requireLogin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { created: 0, merged: 0, skipped: 0, message: "Choose a CSV file." };
  const rows = parseCsv(await file.text());
  if (rows.length < 2) return { created: 0, merged: 0, skipped: 0, message: "No data rows found." };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (r: string[], name: string) => {
    const i = header.indexOf(name);
    return i >= 0 ? r[i]?.trim() || null : null;
  };
  if (!header.includes("name")) return { created: 0, merged: 0, skipped: 0, message: "CSV needs a 'name' column." };

  let created = 0, merged = 0, skipped = 0;
  // Only company-level columns are read; any person/email columns in the file are ignored on purpose.
  for (const r of rows.slice(1)) {
    const name = col(r, "name");
    const domain = normaliseDomain(col(r, "domain") ?? col(r, "website"));
    if (!name) { skipped++; continue; }
    if (domain) {
      const blocked = await query(`SELECT 1 FROM suppression WHERE lower(domain) = $1`, [domain]);
      if (blocked.length) { skipped++; continue; }
    } else if ((await query(`SELECT 1 FROM companies WHERE domain IS NULL AND lower(name) = lower($1)`, [name])).length) {
      merged++; continue;
    }
    const res = await query<{ inserted: boolean }>(
      `INSERT INTO companies (name, domain, phone, address, postcode, niche, company_number, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8,'csv_import'))
       ON CONFLICT (lower(domain)) WHERE domain IS NOT NULL DO UPDATE SET
         phone = COALESCE(companies.phone, EXCLUDED.phone),
         address = COALESCE(companies.address, EXCLUDED.address),
         postcode = COALESCE(companies.postcode, EXCLUDED.postcode),
         niche = COALESCE(companies.niche, EXCLUDED.niche)
       RETURNING (xmax = 0) AS inserted`,
      [name, domain, col(r, "phone"), col(r, "address"), col(r, "postcode"), col(r, "niche"), col(r, "company_number"), col(r, "source")],
    );
    res[0].inserted ? created++ : merged++;
  }
  await logActivity("csv_import", { body: `${created} created, ${merged} merged, ${skipped} skipped` });
  revalidatePath("/companies");
  return { created, merged, skipped };
}

export async function moveDeal(dealId: number, stage: string, lostReason?: string) {
  await requireLogin();
  if (!(STAGES as readonly string[]).includes(stage)) throw new Error("Unknown stage");
  const rows = await query<{ company_id: number | null; title: string; old: string }>(
    `UPDATE deals d SET stage = $2::deal_stage, lost_reason = CASE WHEN $2 = 'Lost' THEN $3 ELSE NULL END
       FROM (SELECT id, stage::text AS old FROM deals WHERE id = $1) prev
      WHERE d.id = prev.id RETURNING d.company_id, d.title, prev.old`,
    [dealId, stage, lostReason ?? null],
  );
  if (!rows[0] || rows[0].old === stage) return;
  await logActivity("stage_changed", {
    company_id: rows[0].company_id, deal_id: dealId,
    body: `${rows[0].title}: ${rows[0].old} → ${stage}${stage === "Lost" && lostReason ? ` (${lostReason})` : ""}`,
  });
  revalidatePath("/deals");
  revalidatePath("/");
}

export async function addLooseTask(form: FormData) {
  await requireLogin();
  const title = str(form, "title");
  if (!title) return;
  await query(`INSERT INTO tasks (title, due_at) VALUES ($1,$2)`, [title, str(form, "due")]);
  revalidatePath("/tasks");
  revalidatePath("/");
}
