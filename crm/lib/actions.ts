"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, tx } from "./db";
import { logActivity } from "./activity";
import { requireLogin } from "./auth";
import { normaliseDomain, parseCsv } from "./csv";
import { STAGES } from "./stages";
import { draftProposal, scoreFit } from "./proposal";
import { generateIdeas, writeScript, formatScript, repurpose } from "./content";
import { findGenericEmail, safeDomain } from "./websites";
import { checkSite, guessWebsite } from "./sitecheck";
import { braveSearch, pickFromResults } from "./websearch";
import { normaliseEmail, normaliseSocial, normaliseWebsite } from "./contact";
import { dailyCap, lookupWebsite } from "./places";
import { ask } from "./llm";
import { gbp, totals, type LineItem } from "./quote";
import { readFile } from "node:fs/promises";
import path from "node:path";

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
  await query(`UPDATE companies SET owner_notes = $1 WHERE id = $2`, [str(form, "notes"), id]);
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

/** The app never sends email. This only records that YOU sent it, and queues the follow-up. */
export async function markOutreachSent(companyId: number, kind: "first" | "followup" | "social", subject: string) {
  await requireLogin();
  const [c] = await query<{ name: string; domain: string | null; generic_email: string | null; is_ltd: boolean | null; status: string }>(
    `SELECT name, domain, generic_email, is_ltd, status FROM companies WHERE id = $1`, [companyId]);
  if (!c) throw new Error("Company not found");
  if (c.is_ltd === false) throw new Error("Outreach is for limited companies only.");
  const suppressed = await query(
    `SELECT 1 FROM suppression WHERE ($1::text IS NOT NULL AND lower(domain) = lower($1)) OR ($2::text IS NOT NULL AND lower(email) = lower($2))`,
    [c.domain, c.generic_email]);
  if (suppressed.length) throw new Error("This company is on your suppression list.");
  if (kind === "social") await logActivity("dm_logged", { company_id: companyId, channel: "dm", body: "Social message sent (company page or contact form)" });
  else await logActivity("email_logged", { company_id: companyId, channel: "email", body: `${kind === "first" ? "Outreach sent" : "Follow-up sent"}: ${subject}` });
  if (c.status === "New") await query(`UPDATE companies SET status = 'Contacted' WHERE id = $1`, [companyId]);
  if (kind === "first" || kind === "social") {
    await query(`INSERT INTO tasks (title, due_at, company_id) VALUES ($1, now() + interval '4 days', $2)`, [`Send the one follow-up to ${c.name}`, companyId]);
  }
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/");
}

// ---- Offers and quotes ----

export async function saveOffer(form: FormData) {
  await requireLogin();
  await query(
    `UPDATE offers SET name = COALESCE($2, name), niche = $3, outcome = $4, setup_price_gbp = $5, monthly_price_gbp = $6,
            loom_url = $7, demo_path = $8, active = $9 WHERE id = $1`,
    [num(form, "id"), str(form, "name"), str(form, "niche"), str(form, "outcome"), num(form, "setup"), num(form, "monthly"),
     str(form, "loom_url"), str(form, "demo_path"), form.get("active") === "on"],
  );
  revalidatePath("/offers");
}

export async function addOffer(form: FormData) {
  await requireLogin();
  const name = str(form, "name");
  if (!name) return;
  await query(
    `INSERT INTO offers (name, niche, outcome, setup_price_gbp, monthly_price_gbp) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (name) DO NOTHING`,
    [name, str(form, "niche"), str(form, "outcome"), num(form, "setup"), num(form, "monthly")],
  );
  revalidatePath("/offers");
}

export async function draftScope(dealId: number, offerIds: number[]): Promise<{ scope?: string; error?: string }> {
  await requireLogin();
  try {
    const [deal] = await query<{ title: string; company: string | null; notes: string | null; company_id: number | null }>(
      `SELECT d.title, c.name AS company, c.owner_notes AS notes, d.company_id FROM deals d LEFT JOIN companies c ON c.id = d.company_id WHERE d.id = $1`, [dealId]);
    if (!deal) return { error: "Deal not found." };
    const offers = offerIds.length ? await query<{ name: string; outcome: string | null }>(`SELECT name, outcome FROM offers WHERE id = ANY($1::bigint[])`, [offerIds]) : [];
    if (offers.length === 0) return { error: "Tick at least one offer first." };
    const activity = deal.company_id
      ? await query<{ type: string; body: string | null }>(`SELECT type, body FROM activities WHERE company_id = $1 ORDER BY occurred_at DESC LIMIT 8`, [deal.company_id])
      : [];
    const prompt =
      `${await readFile(path.join(process.cwd(), "..", "prompts", "quote-scope.md"), "utf8")}\n\n` +
      `CLIENT: ${deal.company ?? "the client"}\nDEAL: ${deal.title}\nNOTES: ${deal.notes ?? "(none)"}\n` +
      `RECENT ACTIVITY:\n${activity.map((a) => `- ${a.type}: ${a.body ?? ""}`).join("\n") || "(none)"}\n\n` +
      `OFFERS TO DESCRIBE:\n${offers.map((o) => `- ${o.name}: ${o.outcome ?? ""}`).join("\n")}`;
    return { scope: await ask(prompt, "sonnet", 3000) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function createQuote(form: FormData) {
  await requireLogin();
  const dealId = num(form, "deal_id");
  const ids = form.getAll("offer_id").map(Number).filter(Boolean);
  if (!ids.length) throw new Error("Pick at least one offer.");
  const [deal] = await query<{ company_id: number | null; title: string }>(`SELECT company_id, title FROM deals WHERE id = $1`, [dealId]);
  if (!deal) throw new Error("Deal not found.");
  const offers = await query<{ id: number; name: string; outcome: string | null }>(`SELECT id, name, outcome FROM offers WHERE id = ANY($1::bigint[]) ORDER BY id`, [ids]);
  const items: LineItem[] = offers.map((o) => ({
    offer_id: o.id, name: o.name, outcome: o.outcome, setup_gbp: Math.max(0, num(form, `setup_${o.id}`)), monthly_gbp: Math.max(0, num(form, `monthly_${o.id}`)),
  }));
  const discount = Math.max(0, num(form, "discount"));
  const t = totals(items, discount);
  const rows = await query<{ id: number }>(
    `INSERT INTO quotes (deal_id, offer_id, line_items, total_setup_gbp, total_monthly_gbp, status, scope, timeline, discount_gbp, valid_until)
     VALUES ($1,$2,$3,$4,$5,'Draft',$6,$7,$8, current_date + 14) RETURNING id`,
    [dealId, items[0].offer_id, JSON.stringify(items), t.setup, t.monthly, str(form, "scope"), str(form, "timeline"), discount],
  );
  await query(`UPDATE deals SET setup_value_gbp = $2, monthly_value_gbp = $3 WHERE id = $1`, [dealId, t.setup, t.monthly]);
  await logActivity("quote_created", { company_id: deal.company_id, deal_id: dealId, body: `Quote #${rows[0].id}: ${gbp(t.setup)} setup + ${gbp(t.monthly)}/mo` });
  redirect(`/quotes/${rows[0].id}`);
}

export async function setQuoteStatus(form: FormData) {
  await requireLogin();
  const id = num(form, "id");
  const status = str(form, "status");
  if (!status || !["Draft", "Sent", "Declined"].includes(status)) return;
  const [q] = await query<{ deal_id: number; company_id: number | null }>(
    `UPDATE quotes q SET status = $2, sent_at = CASE WHEN $2::text = 'Sent' AND q.sent_at IS NULL THEN now() ELSE q.sent_at END
       FROM deals d WHERE q.id = $1 AND d.id = q.deal_id AND q.status <> 'Accepted' RETURNING q.deal_id, d.company_id`, [id, status]);
  if (q) await logActivity(`quote_${status.toLowerCase()}`, { company_id: q.company_id, deal_id: q.deal_id, body: `Quote #${id} marked ${status}` });
  revalidatePath(`/quotes/${id}`);
  revalidatePath("/quotes");
}

/** Accepting a quote: deal -> Won, company -> Client, one client_services row per line item, review task 7 days before each review. */
export async function acceptQuote(form: FormData) {
  await requireLogin();
  const id = num(form, "id");
  const result = await tx(async (c) => {
    const { rows: [q] } = await c.query(
      `UPDATE quotes SET status = 'Accepted', accepted_at = now() WHERE id = $1 AND status <> 'Accepted'
       RETURNING deal_id, line_items, discount_gbp`, [id]);
    if (!q) return null; // already accepted: do nothing, so nothing is duplicated
    const { rows: [d] } = await c.query(`UPDATE deals SET stage = 'Won', lost_reason = NULL WHERE id = $1 RETURNING company_id, title`, [q.deal_id]);
    if (!d?.company_id) throw new Error("This deal has no company, so a client can't be created.");
    const { rows: [co] } = await c.query(`UPDATE companies SET status = 'Client' WHERE id = $1 RETURNING name`, [d.company_id]);
    const items = q.line_items as LineItem[];
    const setupTotal = items.reduce((sum, i) => sum + i.setup_gbp, 0);
    const discount = Number(q.discount_gbp);
    for (const i of items) {
      const setupFee = setupTotal > 0 ? Math.round((i.setup_gbp - (discount * i.setup_gbp) / setupTotal) * 100) / 100 : 0;
      await c.query(
        `INSERT INTO client_services (company_id, offer_id, setup_fee_gbp, monthly_fee_gbp, start_date, status, next_review_date)
         VALUES ($1,$2,$3,$4,current_date,'Active', current_date + 90)`, [d.company_id, i.offer_id, setupFee, i.monthly_gbp]);
      await c.query(
        `INSERT INTO tasks (title, due_at, company_id, deal_id) VALUES ($1, (current_date + 83)::timestamptz, $2, $3)`,
        [`Review ${i.name} with ${co.name}`, d.company_id, q.deal_id]);
    }
    return { company_id: d.company_id as number, deal_id: q.deal_id as number, title: d.title as string, count: items.length };
  });
  if (result) {
    await logActivity("quote_accepted", { company_id: result.company_id, deal_id: result.deal_id, body: `Quote #${id} accepted` });
    await logActivity("stage_changed", { company_id: result.company_id, deal_id: result.deal_id, body: `${result.title}: → Won` });
  }
  revalidatePath(`/quotes/${id}`);
  revalidatePath("/quotes");
  revalidatePath("/clients");
  revalidatePath("/deals");
  revalidatePath("/");
}

export async function saveService(form: FormData) {
  await requireLogin();
  const status = str(form, "status") ?? "Active";
  if (!["Active", "Paused", "Ended"].includes(status)) return;
  const review = str(form, "next_review_date");
  if (review && !/^\d{4}-\d{2}-\d{2}$/.test(review)) return;
  await query(`UPDATE client_services SET status = $2, next_review_date = $3 WHERE id = $1`, [num(form, "id"), status, review]);
  revalidatePath("/clients");
}

const COMPANY_STATUSES = ["New", "Contacted", "Replied", "Client", "Not a fit"];

export async function setCompanyStatus(companyId: number, status: string) {
  await requireLogin();
  if (!COMPANY_STATUSES.includes(status)) throw new Error("Unknown status");
  const [row] = await query<{ name: string; old: string }>(
    `UPDATE companies c SET status = $2 FROM (SELECT id, status AS old FROM companies WHERE id = $1) prev
      WHERE c.id = prev.id RETURNING c.name, prev.old`, [companyId, status]);
  if (row && row.old !== status) await logActivity("status_changed", { company_id: companyId, body: `${row.old} → ${status}` });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
}

// ---- Deals ----

export async function createDealAction(companyId: number, title: string, setup: number, monthly: number): Promise<{ id?: number; error?: string }> {
  await requireLogin();
  const t = title.trim();
  if (!t) return { error: "Give the deal a title." };
  const [c] = await query<{ id: number }>(`SELECT id FROM companies WHERE id = $1`, [companyId]);
  if (!c) return { error: "Pick a company." };
  const rows = await query<{ id: number }>(
    `INSERT INTO deals (company_id, title, setup_value_gbp, monthly_value_gbp, source) VALUES ($1,$2,$3,$4,'manual') RETURNING id`,
    [companyId, t, Math.max(0, setup) || 0, Math.max(0, monthly) || 0]);
  await logActivity("deal_created", { company_id: companyId, deal_id: rows[0].id, body: t });
  revalidatePath("/deals");
  revalidatePath(`/companies/${companyId}`);
  return { id: rows[0].id };
}

export async function updateDeal(form: FormData) {
  await requireLogin();
  const id = num(form, "id");
  const title = str(form, "title");
  if (!title) throw new Error("A deal needs a title.");
  const close = str(form, "expected_close");
  if (close && !/^\d{4}-\d{2}-\d{2}$/.test(close)) throw new Error("Use a valid date.");
  await query(
    `UPDATE deals SET title = $2, setup_value_gbp = $3, monthly_value_gbp = $4, expected_close = $5, source = $6 WHERE id = $1`,
    [id, title, Math.max(0, num(form, "setup")), Math.max(0, num(form, "monthly")), close, str(form, "source")]);
  revalidatePath(`/deals/${id}`);
  revalidatePath("/deals");
}

export async function addDealTask(form: FormData) {
  await requireLogin();
  const dealId = num(form, "deal_id");
  const title = str(form, "title");
  if (!title) return;
  const [d] = await query<{ company_id: number | null }>(`SELECT company_id FROM deals WHERE id = $1`, [dealId]);
  if (!d) throw new Error("Deal not found.");
  await query(`INSERT INTO tasks (title, due_at, company_id, deal_id) VALUES ($1,$2,$3,$4)`, [title, str(form, "due"), d.company_id, dealId]);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function logDealNote(form: FormData) {
  await requireLogin();
  const dealId = num(form, "deal_id");
  const body = str(form, "body");
  if (!body) return;
  const [d] = await query<{ company_id: number | null }>(`SELECT company_id FROM deals WHERE id = $1`, [dealId]);
  if (!d) throw new Error("Deal not found.");
  await logActivity("note_logged", { company_id: d.company_id, deal_id: dealId, channel: "note", body });
  revalidatePath(`/deals/${dealId}`);
}

const IDEA_FORMATS = ["Show the build", "Build in public", "Teach / steal this", "Niche pain"];

export async function createIdeaAction(idea: string, format: string): Promise<{ id?: number; error?: string }> {
  await requireLogin();
  const text = idea.trim();
  if (!text) return { error: "Write the idea first." };
  if (text.length > 300) return { error: "Keep the idea under 300 characters." };
  const rows = await query<{ id: number }>(
    `INSERT INTO content_items (idea, format, status) VALUES ($1, $2, 'Idea') RETURNING id`,
    [text, IDEA_FORMATS.includes(format) ? format : null]);
  await logActivity("content_idea_added", { body: text });
  revalidatePath("/content");
  return { id: rows[0].id };
}

// ---- Contact routes (company-level only) ----

export async function saveContactDetails(form: FormData) {
  await requireLogin();
  const id = num(form, "company_id");
  const [old] = await query<any>(`SELECT domain, generic_email, phone, linkedin_url, instagram_url, facebook_url, contact_url FROM companies WHERE id = $1`, [id]);
  if (!old) throw new Error("Company not found.");
  const site = normaliseWebsite(str(form, "domain")), email = normaliseEmail(str(form, "generic_email"));
  const li = normaliseSocial("linkedin", str(form, "linkedin_url")), ig = normaliseSocial("instagram", str(form, "instagram_url"));
  const fb = normaliseSocial("facebook", str(form, "facebook_url")), cu = normaliseSocial("contact", str(form, "contact_url"));
  const problem = [site, email, li, ig, fb, cu].map((r) => r.error).find(Boolean);
  if (problem) throw new Error(problem);
  if (site.value && !safeDomain(site.value)) throw new Error("That website isn't allowed.");
  const blocked = await query(
    `SELECT 1 FROM suppression WHERE ($1::text IS NOT NULL AND lower(domain) = $1) OR ($2::text IS NOT NULL AND lower(email) = $2)`, [site.value, email.value]);
  if (blocked.length) throw new Error("That website or email is on your suppression list. Don't contact it.");
  const phone = str(form, "phone")?.slice(0, 40) ?? null;
  const verifiedIn = str(form, "domain_verified");
  const verified = site.value ? (site.value === old.domain ? undefined : ["company number", "name"].includes(verifiedIn ?? "") ? verifiedIn : "manual") : null;
  try {
    await query(
      `UPDATE companies SET domain = $2, generic_email = $3, phone = $4, linkedin_url = $5, instagram_url = $6, facebook_url = $7, contact_url = $8,
              domain_verified = CASE WHEN $9::boolean THEN $10 ELSE domain_verified END WHERE id = $1`,
      [id, site.value, email.value, phone, li.value, ig.value, fb.value, cu.value, verified !== undefined, verified ?? null]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("companies_domain_uniq")) throw new Error("Another company already has that website. It may be a duplicate.");
    throw new Error(msg);
  }
  const changed = [["website", old.domain, site.value], ["email", old.generic_email, email.value], ["phone", old.phone, phone], ["LinkedIn", old.linkedin_url, li.value],
    ["Instagram", old.instagram_url, ig.value], ["Facebook", old.facebook_url, fb.value], ["contact page", old.contact_url, cu.value]].filter(([, a, b]) => a !== b).map(([n]) => n);
  if (changed.length) await logActivity("contact_details_updated", { company_id: id, body: `Updated: ${changed.join(", ")}` });
  revalidatePath(`/companies/${id}`);
  revalidatePath("/research");
  revalidatePath("/companies");
}

export type SiteResult = {
  error?: string; domain?: string; verified?: string; emails?: string[]; linkedin?: string | null; instagram?: string | null; facebook?: string | null;
  contact_url?: string | null; signals?: Record<string, boolean>; pages?: number;
};

/** Free: guess the website from the company name and prove it is theirs. Suggests only; you click Save. */
export async function guessWebsiteAction(companyId: number): Promise<SiteResult> {
  await requireLogin();
  const [c] = await query<{ name: string; company_number: string | null }>(`SELECT name, company_number FROM companies WHERE id = $1`, [companyId]);
  if (!c) return { error: "Company not found." };
  const hit = await guessWebsite(c);
  if (!hit) return { error: "No matching website found at the usual addresses. Try the Google links, then paste it in." };
  if ((await query(`SELECT 1 FROM suppression WHERE lower(domain) = $1`, [hit.domain])).length) return { error: "That website is on your suppression list." };
  return { domain: hit.domain, verified: hit.verified };
}

/** Free: read the company's own website for generic emails, company social pages and whether it runs ads. Suggests only. */
export async function checkSiteAction(companyId: number, domainInput: string): Promise<SiteResult> {
  await requireLogin();
  const [c] = await query<{ domain: string | null }>(`SELECT domain FROM companies WHERE id = $1`, [companyId]);
  if (!c) return { error: "Company not found." };
  const site = normaliseWebsite(domainInput || c.domain);
  if (!site.value) return { error: site.error ?? "Enter the website first." };
  const f = await checkSite(site.value);
  if (!f) return { error: "Couldn't read that site (it may block automated checks or be down). Check it by hand." };
  if (site.value === c.domain) {
    await query(`UPDATE companies SET site_signals = $2::jsonb, site_checked_at = now() WHERE id = $1`, [companyId, JSON.stringify(f.signals)]);
    revalidatePath(`/companies/${companyId}`);
  }
  await logActivity("site_checked", { company_id: companyId, channel: "website", body: `${site.value}: ${f.emails.length} generic email(s), ${f.signals.runs_ads ? "runs ads" : "no ad tags seen"}` });
  return { domain: site.value, ...f };
}

/** Google Places lookup. Uses Google credits, so it only runs when you click, stops at the daily cap, and only suggests. */
export async function suggestPlacesAction(companyId: number): Promise<{ error?: string; domain?: string; phone?: string | null; matched?: string }> {
  await requireLogin();
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'places_lookup' AND occurred_at::date = current_date`);
  if (Number(n) >= dailyCap()) return { error: `Daily cap of ${dailyCap()} Google lookups reached. Try again tomorrow, or use the free search links.` };
  const [c] = await query<{ name: string; postcode: string | null }>(`SELECT name, postcode FROM companies WHERE id = $1`, [companyId]);
  if (!c) return { error: "Company not found." };
  try {
    const hit = await lookupWebsite(c);
    await logActivity("places_lookup", { company_id: companyId, channel: "google_places", body: hit ? `${hit.domain} (suggested, matched "${hit.matchedName}")` : "no confident match" });
    if (!hit) return { error: "Google had no confident match. Try the free search links." };
    return { domain: hit.domain, phone: hit.phone, matched: hit.matchedName };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Web search for social pages and the website. Uses search credits, so it only runs when you click, within a daily cap. Suggests only. */
export async function searchWebAction(companyId: number): Promise<{ error?: string; linkedin?: string | null; instagram?: string | null; facebook?: string | null; websites?: string[] }> {
  await requireLogin();
  if (!process.env.SEARCH_API_KEY) return { error: "Web search isn't switched on. Add SEARCH_API_KEY (Brave Search) to your .env first." };
  const cap = Number(process.env.SEARCH_DAILY_CAP ?? 15) || 15;
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'search_lookup' AND occurred_at::date = current_date`);
  if (Number(n) >= cap) return { error: `Daily cap of ${cap} searches reached. Use the free search links, or try again tomorrow.` };
  const [c] = await query<{ name: string; postcode: string | null }>(`SELECT name, postcode FROM companies WHERE id = $1`, [companyId]);
  if (!c) return { error: "Company not found." };
  try {
    const hits = await braveSearch(`"${c.name}" ${c.postcode?.split(" ")[0] ?? ""} UK`.trim());
    await logActivity("search_lookup", { company_id: companyId, channel: "web_search", body: `${hits.length} results` });
    const picked = pickFromResults(hits, c.name);
    if (!picked.linkedin && !picked.instagram && !picked.facebook && picked.websites.length === 0) return { error: "Nothing confident in the results. Try the free search links." };
    return picked;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
