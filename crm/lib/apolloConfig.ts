import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

export type ApolloRoles = { seniorities: string[]; titles: string[]; includeSimilar: boolean };
const ALLOWED = ["owner", "founder", "c_suite", "partner", "vp", "head", "director", "manager", "senior", "entry", "intern"];
const DEFAULTS: ApolloRoles = { seniorities: ["owner", "founder", "c_suite", "partner", "director", "head"], titles: ["Owner", "Founder", "Managing Director", "CEO", "Director", "Head of Marketing", "Head of Operations"], includeSimilar: true };

/** Which roles count as decision-makers, from config/apollo.yaml (falls back to sensible defaults if the file is missing or wrong). */
export async function apolloRoles(): Promise<ApolloRoles> {
  try {
    const y = parse(await readFile(path.join(path.resolve(process.cwd(), ".."), "config/apollo.yaml"), "utf8"));
    const seniorities = (Array.isArray(y?.seniorities) ? y.seniorities : []).map(String).filter((s: string) => ALLOWED.includes(s));
    const titles = (Array.isArray(y?.titles) ? y.titles : []).map((t: unknown) => String(t).trim().slice(0, 60)).filter(Boolean).slice(0, 20);
    return { seniorities: seniorities.length ? seniorities : DEFAULTS.seniorities, titles: titles.length ? titles : DEFAULTS.titles, includeSimilar: y?.include_similar_titles !== false };
  } catch { return DEFAULTS; }
}
