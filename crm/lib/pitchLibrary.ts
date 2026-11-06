// Reads the owner's profile, proof library and answer bank for the Loom pitch.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { query } from "./db.ts";
import { usableProof, type BankAnswer, type LoomInputs, type PitchContext, type Profile, type ProofItem, type Rates } from "./loomPitchMath.ts";

const ROOT = path.resolve(process.cwd(), "..");

export async function loadProfile(): Promise<Profile> {
  const [r] = await query<any>(`SELECT * FROM pitch_profile LIMIT 1`);
  return {
    name: r?.name || process.env.SENDER_NAME || "", positioning_line: r?.positioning_line ?? "", short_positioning: r?.short_positioning ?? "",
    strong_tools: r?.strong_tools ?? [], familiar_tools: r?.familiar_tools ?? [], preferred_defaults: r?.preferred_defaults ?? "",
    portfolio_links: Array.isArray(r?.portfolio_links) ? r.portfolio_links : [], facts: r?.facts ?? [],
  };
}

export const loadProof = () => query<ProofItem & { id: number }>(
  `SELECT id::int AS id, name, kind, one_line, problem_solved, tools, results, link, tags, to_char(last_worked_on, 'YYYY-MM-DD') AS last_worked_on, notes
     FROM proof_items ORDER BY (kind = 'client') DESC, (kind = 'own_business') DESC, (kind = 'demo') DESC, name`);

export const loadBank = () => query<BankAnswer & { last_used_at: string | null }>(
  `SELECT id::int AS id, category, question, answer, last_used_at FROM answer_bank ORDER BY category, question`);

async function loadRates(): Promise<Rates> {
  const y = parse(await readFile(path.join(ROOT, "config/rates.yaml"), "utf8").catch(() => "")) ?? {};
  const rate = Number(y.hourly_rate_gbp), fx = Number(y.usd_to_gbp);
  return { hourly_rate_gbp: Number.isFinite(rate) && rate > 0 ? rate : 45, usd_to_gbp: Number.isFinite(fx) && fx > 0 ? fx : null };
}

export async function loadPitchContext(jobText: string, inputs: LoomInputs): Promise<PitchContext> {
  const [profile, proof, bank, rates, coverTemplate] = await Promise.all([
    loadProfile(), loadProof(), loadBank(), loadRates(), readFile(path.join(ROOT, "prompts/loom-cover-letter.md"), "utf8"),
  ]);
  return { jobText, inputs, profile, proof: usableProof(proof), bank, rates, coverTemplate, today: new Date().toISOString().slice(0, 10) };
}
