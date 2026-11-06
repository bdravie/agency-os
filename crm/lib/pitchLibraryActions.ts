"use server";

import { revalidatePath } from "next/cache";
import { requireLogin } from "./auth";
import { containsContactDetails } from "./audit";
import { query } from "./db";

const val = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const lines = (s: string) => s.split("\n").map((l) => l.replace(/^\s*[-*•]\s+/, "").trim()).filter(Boolean);
const commas = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
const isHttps = (u: string) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };
const PATH = "/proposals/library";

export async function saveProfileAction(form: FormData): Promise<{ error?: string }> {
  await requireLogin();
  const facts = lines(val(form, "facts")), strong = lines(val(form, "strong_tools")), familiar = lines(val(form, "familiar_tools"));
  const links = lines(val(form, "portfolio_links")).map((l) => {
    const at = l.lastIndexOf("|");
    return at < 0 ? { label: l, url: l } : { label: l.slice(0, at).trim(), url: l.slice(at + 1).trim() };
  });
  if (links.some((l) => !isHttps(l.url))) return { error: "Portfolio links must be full https addresses, as: Label | https://..." };
  const short = val(form, "short_positioning");
  if (short.length > 40) return { error: "Keep the short positioning to 40 characters: the cover letter has little room." };
  const all = [val(form, "name"), val(form, "positioning_line"), short, val(form, "preferred_defaults"), ...facts].join(" ");
  if (containsContactDetails(all)) return { error: "Leave email addresses and phone numbers out of your profile." };
  await query(
    `INSERT INTO pitch_profile (id, name, positioning_line, short_positioning, strong_tools, familiar_tools, preferred_defaults, portfolio_links, facts)
     VALUES (true,$1,$2,$3,$4,$5,$6,$7::jsonb,$8)
     ON CONFLICT (id) DO UPDATE SET name = $1, positioning_line = $2, short_positioning = $3, strong_tools = $4, familiar_tools = $5, preferred_defaults = $6, portfolio_links = $7::jsonb, facts = $8`,
    [val(form, "name") || null, val(form, "positioning_line") || null, short || null, strong, familiar, val(form, "preferred_defaults") || null, JSON.stringify(links), facts]);
  revalidatePath(PATH);
  return {};
}

export async function saveProofAction(form: FormData): Promise<{ error?: string }> {
  await requireLogin();
  const id = Number(val(form, "id")) || null, name = val(form, "name"), link = val(form, "link"), date = val(form, "last_worked_on");
  if (!name || name.length > 120) return { error: "Give it a name of up to 120 characters." };
  if (link && !isHttps(link)) return { error: "The link must be a full https address." };
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "That date could not be read." };
  const texts = ["one_line", "problem_solved", "results", "notes"].map((k) => val(form, k) || null);
  if (containsContactDetails(`${name} ${texts.join(" ")}`)) return { error: "Leave email addresses and phone numbers out of the proof library." };
  const kind = val(form, "kind");
  if (!["client", "own_business", "demo", "internal_tool"].includes(kind)) return { error: "Choose what kind of project this is." };
  const params = [name, kind, texts[0], texts[1], commas(val(form, "tools")), texts[2], link || null, commas(val(form, "tags")), date || null, texts[3]];
  try {
    if (id) await query(`UPDATE proof_items SET name=$2, kind=$3, one_line=$4, problem_solved=$5, tools=$6, results=$7, link=$8, tags=$9, last_worked_on=$10, notes=$11 WHERE id=$1`, [id, ...params]);
    else await query(`INSERT INTO proof_items (name, kind, one_line, problem_solved, tools, results, link, tags, last_worked_on, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, params);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return { error: "You already have a project with that name." };
    throw err;
  }
  revalidatePath(PATH);
  return {};
}

export async function deleteProofAction(form: FormData) {
  await requireLogin();
  await query(`DELETE FROM proof_items WHERE id = $1`, [Number(val(form, "id"))]);
  revalidatePath(PATH);
}

export async function saveAnswerAction(form: FormData): Promise<{ error?: string }> {
  await requireLogin();
  const id = Number(val(form, "id")) || null, question = val(form, "question"), answer = val(form, "answer"), category = val(form, "category");
  if (!question || !answer) return { error: "Write both the question and the answer." };
  if (question.length > 500 || answer.length > 3000) return { error: "That is too long to save." };
  if (!["cover_letter", "certifications", "experience", "tone", "metrics", "custom"].includes(category)) return { error: "Choose a category." };
  if (containsContactDetails(`${question} ${answer}`)) return { error: "Leave email addresses and phone numbers out of the bank." };
  if (id) await query(`UPDATE answer_bank SET category=$2, question=$3, answer=$4 WHERE id=$1`, [id, category, question, answer]);
  else await query(`INSERT INTO answer_bank (category, question, answer) VALUES ($1,$2,$3)`, [category, question, answer]);
  revalidatePath(PATH);
  return {};
}

export async function deleteAnswerAction(form: FormData) {
  await requireLogin();
  await query(`DELETE FROM answer_bank WHERE id = $1`, [Number(val(form, "id"))]);
  revalidatePath(PATH);
}
