// Pure rules for Lead Sourcer > This week: how big the list is, how it is shared between niches, which companies fill it
// and which person is suggested for each. No database and no clock, so it can be tested.
import { rankPeople, type Person } from "./apolloMath.ts";

export const DEFAULT_LIST_SIZE = 50;
export const MAX_LIST_SIZE = 200;
/** How many of the people Apollo's free search found are kept per company, so the suggestion can be swapped without searching again. */
export const MAX_CANDIDATES = 5;

/** `weekly_list.size` in config/targets.yaml. Anything that is not a positive whole number falls back to 50. */
export function parseListSize(raw: any): number {
  const n = Number(raw?.weekly_list?.size);
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_LIST_SIZE) : DEFAULT_LIST_SIZE;
}

export type NicheShare = { key: string; emails: number };

/**
 * Shares the list between the niches that use email, in proportion to each niche's weekly email target (equal shares when none has one).
 * Whole numbers that add up to `size` exactly: leftover places go to the largest remainders, then in the order given.
 */
export function splitByNiche(size: number, niches: NicheShare[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (size <= 0 || niches.length === 0) return out;
  const weights = niches.map((n) => (n.emails > 0 ? n.emails : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const w = total > 0 ? weights : niches.map(() => 1), sum = total > 0 ? total : niches.length;
  const exact = w.map((x) => (size * x) / sum);
  const base = exact.map(Math.floor);
  let left = size - base.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, rem: x - Math.floor(x) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const o of order) { if (left <= 0) break; if (w[o.i] > 0) { base[o.i]++; left--; } }
  niches.forEach((n, i) => { out[n.key] = base[i]; });
  return out;
}

export type Candidate = { id: number; niche: string; suitability: number };

/**
 * Fills each niche's share with its highest-scoring companies. Places a niche cannot fill go to the best companies left in the others,
 * so a thin niche never leaves the list short while good leads wait elsewhere. `taken` is how many each niche already has this week.
 */
export function pickCompanies(alloc: Record<string, number>, rows: Candidate[], taken: Record<string, number> = {}): Candidate[] {
  const best = (a: Candidate, b: Candidate) => b.suitability - a.suitability || a.id - b.id;
  const picked: Candidate[] = [], spare: Candidate[] = [];
  let unfilled = 0;
  for (const [key, share] of Object.entries(alloc)) {
    const want = Math.max(0, share - (taken[key] ?? 0));
    const mine = rows.filter((r) => r.niche === key).sort(best);
    picked.push(...mine.slice(0, want));
    spare.push(...mine.slice(want));
    unfilled += Math.max(0, want - mine.length);
  }
  return [...picked, ...spare.sort(best).slice(0, unfilled)].sort(best);
}

export type Suggestion = { candidates: Person[]; chosen: string | null; note: string | null };

/**
 * The person suggested for a company: the most senior one Apollo holds an email for (a reveal for anyone else would find nothing).
 * Keeps the next few so the owner can swap. A company with no one reachable keeps its note and costs no credit later.
 */
export function suggestPerson(people: Person[]): Suggestion {
  const ranked = rankPeople(people).slice(0, MAX_CANDIDATES);
  if (ranked.length === 0) return { candidates: [], chosen: null, note: "Apollo found no senior people at this company." };
  const first = ranked.find((p) => p.hasEmail);
  return first ? { candidates: ranked, chosen: first.id, note: null } : { candidates: ranked, chosen: null, note: "Apollo holds no email for the senior people it found." };
}

/** Reads the saved candidates back safely (the column is JSON, so treat it as untrusted). */
export function readCandidates(raw: unknown): Person[] {
  const out: Person[] = [];
  for (const p of Array.isArray(raw) ? raw : []) {
    if (!p || typeof p.id !== "string" || !/^[A-Za-z0-9_-]{1,60}$/.test(p.id) || typeof p.firstName !== "string") continue;
    out.push({ id: p.id, firstName: p.firstName.slice(0, 40), lastInitial: typeof p.lastInitial === "string" ? p.lastInitial.slice(0, 1) : "", title: typeof p.title === "string" ? p.title.slice(0, 80) : null, org: null, hasEmail: p.hasEmail === true });
  }
  return out.slice(0, MAX_CANDIDATES);
}

export type ListSort = "new" | "fit";
/** `?sort=` on This week: newest added first unless Best fit is chosen. */
export const parseSort = (raw: unknown): ListSort => (raw === "fit" ? "fit" : "new");

export type Run<T> = { key: string; label: string; rows: T[] };
type Dated = { addedKey: string; addedLabel: string; suitability: number; id: number };

/**
 * Newest first: one group per build of the list, newest build at the top. Each build is a single INSERT, so its rows share one
 * created_at exactly (`addedKey`); two builds in the same minute stay apart. Inside a build, best score first.
 * Best fit: one group, best score first, as before.
 */
export function groupRuns<T extends Dated>(rows: T[], sort: ListSort): Run<T>[] {
  const best = (a: T, b: T) => b.suitability - a.suitability || a.id - b.id;
  if (sort === "fit") return rows.length ? [{ key: "all", label: "", rows: [...rows].sort(best) }] : [];
  const runs = new Map<string, Run<T>>();
  for (const r of rows) {
    const run = runs.get(r.addedKey) ?? { key: r.addedKey, label: r.addedLabel, rows: [] };
    run.rows.push(r);
    runs.set(r.addedKey, run);
  }
  return [...runs.values()].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0)).map((g) => ({ ...g, rows: g.rows.sort(best) }));
}

export const personLabel =(p: Person) => `${p.firstName}${p.lastInitial ? ` ${p.lastInitial}.` : ""}${p.title ? `, ${p.title}` : ""}`;
