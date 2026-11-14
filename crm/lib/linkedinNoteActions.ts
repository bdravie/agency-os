"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { withPositioning } from "./positioning";
import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { assertSendable } from "./complianceGate";
import { assertNicheAllows, nicheTable } from "./nicheGate";
import { askStructured, linkedinNoteModel } from "./llm";
import { assembleNote, bodyBudget, noteProblems, noteWarnings, stripFrame } from "./linkedinNoteMath";

// LinkedIn connection notes (docs/NICHE_FOCUS_PLAN.md, N2). Drafting only: the app never sends anything on LinkedIn.
// Click-only and capped (LINKEDIN_NOTE_DAILY_CAP, default 10). Only for a company that passes lead_gate and whose niche uses LinkedIn
// (active, or seeding), and only for a person who has not opted out or been suppressed.

export type NoteResult = { note?: string; warnings?: string[]; model?: string; error?: string };

const noteCap = () => Number(process.env.LINKEDIN_NOTE_DAILY_CAP ?? 10) || 10;
const companyName = (n: string) => n.replace(/[.,]?\s+(limited|ltd\.?|llp|plc)$/i, "").trim();

async function person(companyId: number, contactId: number | null): Promise<{ id: number; name: string; role: string | null } | { error: string } | null> {
  if (!contactId) return null;
  const [ct] = await query<{ id: number; name: string; role: string | null; blocked: boolean }>(
    `SELECT ct.id, ct.name, ct.role, cg.blocked_person AS blocked FROM contacts ct JOIN contact_gate cg ON cg.contact_id = ct.id WHERE ct.id = $1 AND ct.company_id = $2`, [contactId, companyId]);
  if (!ct) return { error: "That person isn't a contact at this company." };
  if (ct.blocked) return { error: `${ct.name} has opted out or is suppressed, so no note is written for them.` };
  return { id: Number(ct.id), name: ct.name, role: ct.role };
}

export async function draftLinkedInNoteAction(companyId: number, contactId: number | null): Promise<NoteResult> {
  await requireLogin();
  try {
    await assertSendable(companyId);
    await assertNicheAllows(companyId, "linkedin");
    const sender = process.env.SENDER_NAME?.trim(), business = process.env.BUSINESS_NAME?.trim();
    if (!sender || !business) return { error: "Set SENDER_NAME and BUSINESS_NAME in .env first. Every note carries your real name and business name." };
    const cap = noteCap();
    const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'linkedin_note_drafted' AND (occurred_at AT TIME ZONE 'Europe/London')::date = (now() AT TIME ZONE 'Europe/London')::date`);
    if (Number(n) >= cap) return { error: `Daily cap of ${cap} LinkedIn note drafts reached. Try again tomorrow.` };
    const p = await person(companyId, contactId);
    if (p && "error" in p) return { error: p.error };
    const [co] = await query<{ name: string; niche: string | null }>(`SELECT display_name AS name, niche FROM companies WHERE id = $1`, [companyId]);
    const niche = (await nicheTable())[co?.niche ?? ""];
    if (!co || !niche) return { error: "Company not found." };

    const who = { firstName: p ? p.name.split(/\s+/)[0] || null : null, sender, business };
    const budget = bodyBudget(who);
    const rules = await withPositioning(await readFile(path.join(path.resolve(process.cwd(), ".."), "prompts", "linkedin-note.md"), "utf8"));
    const facts = [
      `COMPANY: ${companyName(co.name)}`,
      p ? `PERSON: ${who.firstName}${p.role ? `, ${p.role}` : ""}` : "PERSON: not named (the greeting is generic)",
      `NICHE: ${niche.label}`,
      niche.promise ? `THE PROMISE: ${niche.promise}` : "",
      niche.painPoints.length ? `COMMON PROBLEMS FOR SUCH BUSINESSES:\n${niche.painPoints.map((x) => `- ${x}`).join("\n")}` : "",
      `CHARACTER BUDGET: ${budget}`,
    ].filter(Boolean).join("\n");
    const model = linkedinNoteModel();
    const schema = { type: "object", required: ["note"], properties: { note: { type: "string" } } } as const;
    let body = "", problems: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {   // one retry showing what to fix, then refused
      const retry = attempt ? `\n\nYOUR LAST DRAFT:\n${body}\n\nFIX THESE PROBLEMS:\n${problems.map((x) => `- ${x}`).join("\n")}` : "";
      const raw = await askStructured<{ note?: unknown }>(`${rules}\n\n${facts}${retry}`, schema as never, model, 1500);
      body = stripFrame(typeof raw?.note === "string" ? raw.note : "");
      problems = noteProblems(body, budget);
      if (!problems.length) break;
    }
    if (problems.length) return { error: `The AI's note broke the rules twice (${problems.join(" ")}). Try again, or write it yourself.` };
    const note = assembleNote(body, who);
    await logActivity("linkedin_note_drafted", { company_id: companyId, contact_id: p?.id ?? null, channel: "linkedin", body: `LinkedIn note drafted (${model})` });
    return { note, warnings: noteWarnings(note), model };
  } catch (err) { return { error: err instanceof Error ? err.message : String(err) }; }
}

/** You sent the note yourself on LinkedIn: log it (checked again here and by the database trigger). */
export async function markLinkedInNoteSentAction(companyId: number, contactId: number | null): Promise<{ ok?: true; error?: string }> {
  await requireLogin();
  try {
    await assertSendable(companyId);
    await assertNicheAllows(companyId, "linkedin");
    const p = await person(companyId, contactId);
    if (p && "error" in p) return { error: p.error };
    await logActivity("linkedin_note_logged", { company_id: companyId, contact_id: p?.id ?? null, channel: "linkedin", body: `LinkedIn connection note sent${p ? ` to ${p.name}` : ""}` });
    await query(`UPDATE companies SET status = 'Contacted' WHERE id = $1 AND status = 'New'`, [companyId]);
    revalidatePath(`/companies/${companyId}`);
    return { ok: true };
  } catch (err) { return { error: err instanceof Error ? err.message : String(err) }; }
}
