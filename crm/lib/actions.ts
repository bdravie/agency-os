"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query } from "./db";
import { logActivity } from "./activity";
import { requireLogin } from "./auth";
import { normaliseDomain, parseCsv } from "./csv";
import { STAGES } from "./stages";
import { draftProposal, scoreFit } from "./proposal";
import { generateIdeas, writeScript, formatScript, repurpose } from "./content";
import { findGenericEmail, safeDomain } from "./websites";
import { dailyCap, lookupWebsite } from "./places";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const num = (f: FormData, k: string) => Number(str(f, k) ?? 0) || 0;

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
    `UPDATE deals d SET stage = $2::text::deal_stage, lost_reason = CASE WHEN $2::text = 'Lost' THEN $3::text ELSE NULL END
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

const PROPOSAL_STATUSES = ["Draft", "Sent", "Interview", "Won", "Lost"];

export async function saveProposal(form: FormData) {
  await requireLogin();
  const id = num(form, "id");
  const status = str(form, "status") ?? "Draft";
  if (!PROPOSAL_STATUSES.includes(status)) return;
  const connects = str(form, "connects_used");
  const rows = await query<{ old: string }>(
    `UPDATE proposals p SET draft = $2, status = $3, connects_used = $4,
            sent_at = CASE WHEN $3::text <> 'Draft' AND p.sent_at IS NULL THEN now() ELSE p.sent_at END
       FROM (SELECT id, status AS old FROM proposals WHERE id = $1) prev
      WHERE p.id = prev.id RETURNING prev.old`,
    [id, str(form, "draft"), status, connects === null ? null : Number(connects)],
  );
  if (rows[0] && rows[0].old !== status) await logActivity("proposal_status", { channel: "upwork", body: `Proposal #${id}: ${rows[0].old} → ${status}` });
  revalidatePath("/proposals");
  revalidatePath(`/proposals/${id}`);
}

export async function createProposal(_prev: string | null, form: FormData): Promise<string | null> {
  await requireLogin();
  const job = str(form, "job_text");
  if (!job || job.length < 40) return "Paste the full job post (at least a few sentences).";
  if (job.length > 20000) return "That job post is too long.";
  let id: number;
  try {
    const [score, reason] = await scoreFit(job);
    if (score < 6 && form.get("force") !== "on") {
      return `Fit score ${score}/10: ${reason} Tick "Draft anyway" to write it regardless.`;
    }
    const draft = await draftProposal(job);
    const rows = await query<{ id: number }>(
      `INSERT INTO proposals (job_title, job_url, job_text, draft, fit_score, status) VALUES ($1,$2,$3,$4,$5,'Draft') RETURNING id`,
      [str(form, "job_title"), str(form, "job_url"), job, draft, score],
    );
    id = rows[0].id;
    await logActivity("proposal_drafted", { channel: "upwork", body: str(form, "job_title") ?? `Proposal #${id}` });
  } catch (err) {
    return `Something went wrong: ${err instanceof Error ? err.message : String(err)}`;
  }
  redirect(`/proposals/${id}`);
}

const CONTENT_STATUSES = ["Idea", "Scripted", "Filmed", "Posted"];

export async function generateIdeasAction(_prev: string | null, form: FormData): Promise<string | null> {
  await requireLogin();
  try {
    const existing = (await query<{ idea: string }>(`SELECT idea FROM content_items ORDER BY created_at DESC LIMIT 40`)).map((r) => r.idea);
    const ideas = await generateIdeas(str(form, "audience"), existing);
    if (ideas.length === 0) return "No ideas came back. Try again.";
    for (const i of ideas) {
      await query(`INSERT INTO content_items (idea, hook, format, status) VALUES ($1,$2,$3,'Idea')`, [i.idea, i.hook ?? null, i.format ?? null]);
    }
    await logActivity("content_ideas_generated", { body: `${ideas.length} ideas` });
  } catch (err) {
    return `Something went wrong: ${err instanceof Error ? err.message : String(err)}`;
  }
  redirect("/content");
}

export async function writeScriptAction(_prev: string | null, form: FormData): Promise<string | null> {
  await requireLogin();
  const id = num(form, "id");
  try {
    const [item] = await query<{ idea: string; status: string }>(`SELECT idea, status FROM content_items WHERE id = $1`, [id]);
    if (!item) return "Item not found.";
    const s = await writeScript(item.idea);
    await query(
      `UPDATE content_items SET hook = $2, script = $3, caption = $4, keyword = $5,
              status = CASE WHEN status = 'Idea' THEN 'Scripted' ELSE status END WHERE id = $1`,
      [id, s.favourite_hook, formatScript(s), s.caption, String(s.keyword ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") || null],
    );
  } catch (err) {
    return `Something went wrong: ${err instanceof Error ? err.message : String(err)}`;
  }
  revalidatePath(`/content/${id}`);
  revalidatePath("/content");
  return null;
}

export async function moveContent(id: number, status: string) {
  await requireLogin();
  if (!CONTENT_STATUSES.includes(status)) throw new Error("Unknown status");
  await query(
    `UPDATE content_items SET status = $2, posted_at = CASE WHEN $2::text = 'Posted' THEN COALESCE(posted_at, now()) ELSE posted_at END WHERE id = $1`,
    [id, status],
  );
  revalidatePath("/content");
}

export async function saveContent(form: FormData) {
  await requireLogin();
  const id = num(form, "id");
  await query(
    `UPDATE content_items SET idea = COALESCE($2, idea), hook = $3, script = $4, caption = $5, keyword = $6 WHERE id = $1`,
    [id, str(form, "idea"), str(form, "hook"), str(form, "script"), str(form, "caption"), str(form, "keyword")],
  );
  revalidatePath(`/content/${id}`);
  revalidatePath("/content");
}

export async function repurposeAction(_prev: string | null, form: FormData): Promise<string | null> {
  await requireLogin();
  const transcript = str(form, "transcript");
  if (!transcript || transcript.length < 200) return "Paste a longer transcript (at least a few paragraphs).";
  try {
    const r = await repurpose(transcript);
    for (const v of r.short_videos.slice(0, 3)) {
      await query(
        `INSERT INTO content_items (idea, format, script, caption, keyword, status) VALUES ($1,'Short video',$2,$3,$4,'Scripted')`,
        [v.idea, v.script, v.caption, String(v.keyword ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") || null],
      );
    }
    for (const p of r.linkedin_posts.slice(0, 3)) {
      await query(`INSERT INTO content_items (idea, format, platforms, script, status) VALUES ($1,'LinkedIn post','{linkedin}',$2,'Scripted')`, [p.idea, p.text]);
    }
    if (r.newsletter?.text) {
      await query(`INSERT INTO content_items (idea, format, platforms, script, status) VALUES ($1,'Newsletter','{newsletter}',$2,'Scripted')`, [r.newsletter.idea, r.newsletter.text]);
    }
    await logActivity("content_repurposed", { body: "3 shorts, 3 LinkedIn posts, 1 newsletter" });
  } catch (err) {
    return `Something went wrong: ${err instanceof Error ? err.message : String(err)}`;
  }
  redirect("/content");
}

export async function scheduleContent(form: FormData) {
  await requireLogin();
  const date = str(form, "date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  await query(`UPDATE content_items SET scheduled_for = $2 WHERE id = $1`, [num(form, "id"), date]);
  revalidatePath("/content/calendar");
  revalidatePath(`/content/${num(form, "id")}`);
}

export async function setWebsite(_prev: string | null, form: FormData): Promise<string | null> {
  await requireLogin();
  const id = num(form, "company_id");
  const domain = normaliseDomain(str(form, "domain"));
  const email = str(form, "generic_email")?.toLowerCase() ?? null;
  if (str(form, "domain") && !domain) return "That doesn't look like a website address.";
  if (domain && !safeDomain(domain)) return "That domain isn't allowed.";
  try {
    if (domain && (await query(`SELECT 1 FROM suppression WHERE lower(domain) = $1`, [domain])).length) {
      return "That domain is on your suppression list. Don't contact it.";
    }
    await query(`UPDATE companies SET domain = $2, generic_email = $3 WHERE id = $1`, [id, domain, email]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("companies_domain_uniq")) return "Another company already has that domain. It may be a duplicate.";
    if (msg.includes("companies_generic_email_chk")) return "Only generic addresses are stored (info@, hello@, contact@, enquiries@...).";
    return `Could not save: ${msg}`;
  }
  revalidatePath(`/companies/${id}`);
  return null;
}

export async function findEmailAction(_prev: string | null, form: FormData): Promise<string | null> {
  await requireLogin();
  const id = num(form, "company_id");
  const [c] = await query<{ domain: string | null }>(`SELECT domain FROM companies WHERE id = $1`, [id]);
  if (!c?.domain || !safeDomain(c.domain)) return "Save a website address first.";
  const email = await findGenericEmail(c.domain);
  if (!email) return "No generic email found on the homepage or contact page (or the site doesn't allow checking). Look manually.";
  if ((await query(`SELECT 1 FROM suppression WHERE lower(email) = $1`, [email])).length) return "That address is on your suppression list.";
  await query(`UPDATE companies SET generic_email = $2 WHERE id = $1`, [id, email]);
  await logActivity("email_found", { company_id: id, body: email });
  revalidatePath(`/companies/${id}`);
  return null;
}

/** Look up websites via Google Places for companies that have none. Hard daily cap; every lookup is logged. */
async function placesFor(ids: number[]): Promise<{ found: number; missed: number; stopped: string | null }> {
  let found = 0, missed = 0;
  for (const id of ids) {
    const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'places_lookup' AND occurred_at::date = current_date`);
    if (Number(n) >= dailyCap()) return { found, missed, stopped: `Daily cap of ${dailyCap()} lookups reached.` };
    const [c] = await query<{ id: number; name: string; postcode: string | null; phone: string | null }>(`SELECT id, name, postcode, phone FROM companies WHERE id = $1 AND domain IS NULL`, [id]);
    if (!c) continue;
    let hit = null;
    try {
      hit = await lookupWebsite(c);
    } catch (err) {
      return { found, missed, stopped: err instanceof Error ? err.message : String(err) };
    }
    await logActivity("places_lookup", { company_id: id, channel: "google_places", body: hit ? `${hit.domain} (matched "${hit.matchedName}")` : "no confident match" });
    if (!hit) { missed++; continue; }
    const blocked = await query(`SELECT 1 FROM suppression WHERE lower(domain) = $1`, [hit.domain]);
    if (blocked.length) { missed++; continue; }
    try {
      await query(`UPDATE companies SET domain = $2, phone = COALESCE(phone, $3) WHERE id = $1`, [id, hit.domain, hit.phone]);
      await logActivity("website_found", { company_id: id, channel: "google_places", body: `${hit.domain} (UNVERIFIED: matched "${hit.matchedName}", please check)` });
      found++;
    } catch { missed++; } // domain already belongs to another company
  }
  return { found, missed, stopped: null };
}

export async function findWebsitesAction(_prev: string | null, form: FormData): Promise<string | null> {
  await requireLogin();
  const limit = Math.min(Math.max(num(form, "limit") || 10, 1), 25);
  const ids = (await query<{ id: number }>(
    `SELECT c.id FROM companies c
      WHERE c.domain IS NULL AND c.is_ltd
        AND NOT EXISTS (SELECT 1 FROM activities a WHERE a.company_id = c.id AND a.type = 'places_lookup')
      ORDER BY c.id LIMIT $1`, [limit])).map((r) => r.id);
  if (ids.length === 0) return "✓ Nothing to look up: every limited company already has a website or has been tried.";
  const r = await placesFor(ids);
  revalidatePath("/companies");
  return `✓ Found ${r.found}, no confident match for ${r.missed}.${r.stopped ? ` Stopped: ${r.stopped}` : ""} Check each website before using it.`;
}

export async function findWebsiteOneAction(_prev: string | null, form: FormData): Promise<string | null> {
  await requireLogin();
  const id = num(form, "company_id");
  const r = await placesFor([id]);
  revalidatePath(`/companies/${id}`);
  if (r.stopped) return r.stopped;
  return r.found ? null : "No confident match on Google. Search manually.";
}
