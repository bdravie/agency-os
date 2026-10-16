"use server";

import { revalidatePath } from "next/cache";
import { query, tx } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { containsContactDetails } from "./audit";
import { todayIso } from "./outcomeData";
import { CADENCES, MAX_FILES, MAX_FILE_BYTES, advanceSchedule, fileInfo, parseAttendeeLines, safeFilename, type Cadence } from "./enablementMath";

const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
const num = (f: FormData, k: string) => Number(str(f, k) ?? 0) || 0;
const isIso = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const level = (s: string | null) => { const n = Number(s); return Number.isInteger(n) && n >= 1 && n <= 3 ? n : null; };
const duration = (f: FormData) => Math.min(600, Math.max(5, Math.round(num(f, "duration")) || 60));
const NO_PERSONAL = "Keep this to names and roles: no email addresses or phone numbers.";
const KINDS = ["workshop", "follow_up", "office_hours", "other"], D_KINDS = ["skill", "prompt", "template", "other"];
const refresh = (companyId: number | string) => { revalidatePath("/enablement"); revalidatePath(`/enablement/${companyId}`); revalidatePath("/"); revalidatePath("/tasks"); };

// ---------- staff ----------

export async function addStaff(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const companyId = num(form, "company_id"), name = str(form, "name"), role = str(form, "role");
  if (!name) return { error: "Enter a name." };
  if (containsContactDetails(name) || containsContactDetails(role)) return { error: NO_PERSONAL };
  try { await query(`INSERT INTO enablement_staff (company_id, name, role, skill_level) VALUES ($1,$2,$3,$4)`, [companyId, name.slice(0, 80), role?.slice(0, 80) ?? null, level(str(form, "level"))]); }
  catch (e: any) { if (e?.code === "23505") return { error: "Someone with that name is already on the list." }; throw e; }
  refresh(companyId);
}

export async function saveStaff(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const id = num(form, "id"), name = str(form, "name"), role = str(form, "role");
  if (!name) return { error: "Enter a name." };
  if (containsContactDetails(name) || containsContactDetails(role)) return { error: NO_PERSONAL };
  try {
    const [s] = await query<{ company_id: number }>(`UPDATE enablement_staff SET name=$2, role=$3, skill_level=$4, active=$5 WHERE id=$1 RETURNING company_id`, [id, name.slice(0, 80), role?.slice(0, 80) ?? null, level(str(form, "level")), form.get("active") === "on"]);
    if (s) refresh(s.company_id);
  } catch (e: any) { if (e?.code === "23505") return { error: "Someone with that name is already on the list." }; throw e; }
}

/** For mistakes and "please delete my data" requests: removes the person and their attendance history. */
export async function deleteStaff(form: FormData): Promise<void> {
  await requireLogin();
  const [s] = await query<{ company_id: number }>(`DELETE FROM enablement_staff WHERE id = $1 RETURNING company_id`, [num(form, "id")]);
  if (s) refresh(s.company_id);
}

// ---------- sessions ----------

/** Records a session: who came, their skill level afterwards, and (if it belongs to a schedule) moves the schedule on. */
export async function logSession(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const companyId = num(form, "company_id");
  const [co] = await query<{ name: string }>(`SELECT name FROM companies WHERE id = $1`, [companyId]);
  if (!co) return { error: "Client not found." };
  const title = str(form, "title"), heldOn = str(form, "held_on"), topics = str(form, "topics");
  const kind = KINDS.includes(str(form, "kind") ?? "") ? str(form, "kind")! : "workshop";
  if (!title) return { error: "Give the session a title." };
  if (!isIso(heldOn)) return { error: "Enter the date it was held." };
  if (heldOn > todayIso()) return { error: "That date is in the future. Log a session once it has happened (use a schedule for upcoming ones)." };
  if (containsContactDetails(title) || containsContactDetails(topics)) return { error: NO_PERSONAL };
  const newPeople = parseAttendeeLines(str(form, "new_attendees") ?? "");
  if (newPeople.some((p) => containsContactDetails(p.name) || containsContactDetails(p.role))) return { error: NO_PERSONAL };

  const existing = await query<{ id: number }>(`SELECT id FROM enablement_staff WHERE company_id = $1`, [companyId]);
  const attending = existing.filter((s) => form.get(`at_${s.id}`) === "on").map((s) => ({ id: Number(s.id), level: level(str(form, `lv_${s.id}`)) }));
  if (attending.length + newPeople.length === 0) return { error: "Tick who attended, or add new attendees." };
  const scheduleId = num(form, "schedule_id") || null;

  await tx(async (c) => {
    const { rows: [sess] } = await c.query(`INSERT INTO enablement_sessions (company_id, schedule_id, title, kind, held_on, duration_minutes, topics) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [companyId, scheduleId, title.slice(0, 200), kind, heldOn, duration(form), topics?.slice(0, 2000) ?? null]);
    const people = [...attending];
    for (const [i, p] of newPeople.entries()) {
      const { rows: [s] } = await c.query(`INSERT INTO enablement_staff (company_id, name, role) VALUES ($1,$2,$3)
        ON CONFLICT (company_id, lower(name)) DO UPDATE SET active = true RETURNING id`, [companyId, p.name, p.role]);
      if (!people.some((x) => x.id === Number(s.id))) people.push({ id: Number(s.id), level: level(str(form, `new_lv_${i}`)) });
    }
    for (const p of people) {
      await c.query(`INSERT INTO enablement_attendance (session_id, staff_id, level_after) VALUES ($1,$2,$3)`, [sess.id, p.id, p.level]);
      if (p.level) await c.query(`UPDATE enablement_staff SET skill_level = $2 WHERE id = $1`, [p.id, p.level]);
    }
    if (scheduleId) await advance(c, scheduleId, companyId, co.name, heldOn);
  });
  await logActivity("enablement_session", { company_id: companyId, body: `${kind === "workshop" ? "Workshop" : "Session"} held: ${title} (${heldOn})` });
  refresh(companyId);
}

export async function deleteSession(form: FormData): Promise<void> {
  await requireLogin();
  const [s] = await query<{ company_id: number }>(`DELETE FROM enablement_sessions WHERE id = $1 RETURNING company_id`, [num(form, "id")]);
  if (s) refresh(s.company_id);
}

// ---------- schedules ----------

type Db = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/** Moves a schedule to its next slot and keeps exactly one open task for it. */
async function advance(c: Db, scheduleId: number, companyId: number, company: string, heldOn: string) {
  const { rows: [h] } = await c.query(`SELECT id, title, cadence, to_char(next_on, 'YYYY-MM-DD') AS next_on, task_id FROM enablement_schedules WHERE id = $1 AND company_id = $2`, [scheduleId, companyId]);
  if (!h) return;
  const next = advanceSchedule(h.cadence as Cadence, h.next_on, heldOn);
  if (h.task_id) await c.query(`UPDATE tasks SET done_at = now() WHERE id = $1 AND done_at IS NULL`, [h.task_id]);
  const { rows: [t] } = await c.query(`INSERT INTO tasks (title, due_at, company_id) VALUES ($1, ($2::date + time '09:00'), $3) RETURNING id`, [`Run session: ${h.title} (${company})`, next, companyId]);
  await c.query(`UPDATE enablement_schedules SET next_on = $2, task_id = $3 WHERE id = $1`, [scheduleId, next, t.id]);
}

export async function addSchedule(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const companyId = num(form, "company_id"), title = str(form, "title"), nextOn = str(form, "next_on");
  const cadence = CADENCES.find((c) => c.code === str(form, "cadence"))?.code;
  const [co] = await query<{ name: string }>(`SELECT name FROM companies WHERE id = $1`, [companyId]);
  if (!co) return { error: "Client not found." };
  if (!title) return { error: "Give the schedule a title." };
  if (!cadence) return { error: "Choose how often." };
  if (!isIso(nextOn)) return { error: "Enter the date of the next session." };
  if (containsContactDetails(title)) return { error: NO_PERSONAL };
  await tx(async (c) => {
    const { rows: [t] } = await c.query(`INSERT INTO tasks (title, due_at, company_id) VALUES ($1, ($2::date + time '09:00'), $3) RETURNING id`, [`Run session: ${title.slice(0, 200)} (${co.name})`, nextOn, companyId]);
    await c.query(`INSERT INTO enablement_schedules (company_id, title, cadence, next_on, duration_minutes, task_id) VALUES ($1,$2,$3,$4,$5,$6)`, [companyId, title.slice(0, 200), cadence, nextOn, duration(form), t.id]);
  });
  await logActivity("enablement_scheduled", { company_id: companyId, body: `Recurring session set up: ${title} (${cadence})` });
  refresh(companyId);
}

export async function saveSchedule(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const id = num(form, "id"), title = str(form, "title"), nextOn = str(form, "next_on");
  const cadence = CADENCES.find((c) => c.code === str(form, "cadence"))?.code;
  if (!title || !cadence || !isIso(nextOn)) return { error: "Title, how often and the next date are all needed." };
  if (containsContactDetails(title)) return { error: NO_PERSONAL };
  const status = form.get("paused") === "on" ? "paused" : "active";
  const [h] = await query<{ company_id: number; task_id: number | null }>(`UPDATE enablement_schedules SET title=$2, cadence=$3, next_on=$4, duration_minutes=$5, status=$6 WHERE id=$1 RETURNING company_id, task_id`, [id, title.slice(0, 200), cadence, nextOn, duration(form), status]);
  if (h?.task_id) await query(`UPDATE tasks t SET due_at = ($2::date + time '09:00'), title = $3 || ' (' || c.name || ')' FROM companies c WHERE t.id = $1 AND c.id = t.company_id AND t.done_at IS NULL`, [h.task_id, nextOn, `Run session: ${title.slice(0, 200)}`]);
  if (h) refresh(h.company_id);
}

export async function deleteSchedule(form: FormData): Promise<void> {
  await requireLogin();
  const [h] = await query<{ company_id: number; task_id: number | null }>(`DELETE FROM enablement_schedules WHERE id = $1 RETURNING company_id, task_id`, [num(form, "id")]);
  if (h?.task_id) await query(`UPDATE tasks SET done_at = now() WHERE id = $1 AND done_at IS NULL`, [h.task_id]);
  if (h) refresh(h.company_id);
}

// ---------- deliverables and files ----------

/** A skill, prompt or template handed to the client: pasted text and/or stored files (kept in the database, so they are backed up). */
export async function addDeliverable(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const companyId = num(form, "company_id"), title = str(form, "title"), description = str(form, "description"), body = str(form, "body"), deliveredOn = str(form, "delivered_on");
  const kind = D_KINDS.includes(str(form, "kind") ?? "") ? str(form, "kind")! : "prompt";
  if (!title) return { error: "Give it a title." };
  if (!isIso(deliveredOn) || deliveredOn > todayIso()) return { error: "Enter the date it was delivered (not in the future)." };
  if (containsContactDetails(title) || containsContactDetails(description)) return { error: NO_PERSONAL };
  const sessionId = num(form, "session_id") || null;
  if (sessionId) { const [s] = await query(`SELECT 1 FROM enablement_sessions WHERE id = $1 AND company_id = $2`, [sessionId, companyId]); if (!s) return { error: "That session belongs to a different client." }; }

  const uploads = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (uploads.length > MAX_FILES) return { error: `Up to ${MAX_FILES} files at a time.` };
  const files: { name: string; type: string; data: Buffer }[] = [];
  for (const f of uploads) {
    const info = fileInfo(f.name);
    if (!info) return { error: `“${f.name}” isn't an allowed file type. Use pdf, docx, xlsx, pptx, txt, md, csv, json, png or jpg.` };
    if (f.size > MAX_FILE_BYTES) return { error: `“${f.name}” is over ${MAX_FILE_BYTES / 1024 / 1024} MB.` };
    files.push({ name: safeFilename(f.name), type: info.contentType, data: Buffer.from(await f.arrayBuffer()) });
  }
  if (!body && files.length === 0) return { error: "Paste the text, or attach at least one file." };

  await tx(async (c) => {
    const { rows: [d] } = await c.query(`INSERT INTO enablement_deliverables (company_id, session_id, kind, title, description, body, delivered_on) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [companyId, sessionId, kind, title.slice(0, 200), description?.slice(0, 600) ?? null, body?.slice(0, 20000) ?? null, deliveredOn]);
    for (const f of files) await c.query(`INSERT INTO enablement_files (deliverable_id, filename, content_type, size_bytes, data) VALUES ($1,$2,$3,$4,$5)`, [d.id, f.name, f.type, f.data.length, f.data]);
  });
  await logActivity("enablement_delivered", { company_id: companyId, body: `${kind} delivered: ${title}${files.length ? ` (${files.length} file${files.length === 1 ? "" : "s"})` : ""}` });
  refresh(companyId);
}

export async function deleteDeliverable(form: FormData): Promise<void> {
  await requireLogin();
  const [d] = await query<{ company_id: number }>(`DELETE FROM enablement_deliverables WHERE id = $1 RETURNING company_id`, [num(form, "id")]);
  if (d) refresh(d.company_id);
}

// ---------- nudging ----------

/** Adds a task to book a session with a client who is 30+ days without one. One open task at a time. */
export async function createSessionTask(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const companyId = num(form, "company_id");
  const [co] = await query<{ name: string }>(`SELECT name FROM companies WHERE id = $1`, [companyId]);
  if (!co) return { error: "Client not found." };
  const [open] = await query(`SELECT 1 FROM tasks WHERE company_id = $1 AND done_at IS NULL AND title LIKE 'Book a training session with %' LIMIT 1`, [companyId]);
  if (open) return { error: "There is already an open task to book a session with this client." };
  await query(`INSERT INTO tasks (title, due_at, company_id) VALUES ($1, (current_date + 1) + time '09:00', $2)`, [`Book a training session with ${co.name}`, companyId]);
  await logActivity("enablement_task", { company_id: companyId, body: `Task added: book a training session with ${co.name}` });
  refresh(companyId);
}
