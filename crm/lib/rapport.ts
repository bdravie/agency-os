import { readFile } from "node:fs/promises";
import path from "node:path";
import { query } from "./db";
import { logActivity } from "./activity";
import { loadGate } from "./complianceGate";
import { askStructured, rapportModel } from "./llm";
import { fetchPublicHtml } from "./safeFetch";
import { robotsAllows, safeDomain } from "./websites";
import { braveSearch } from "./websearch";
import { creditUsage } from "./usage";
import { maskContacts } from "./transcript";
import { pickLinks, visibleText } from "./researchAnalysis";
import { allowedSourceHost, excerptAround, mentionsCompany, mentionsPerson, verifyPoints, type RapportPoint, type Source } from "./rapportMath";

// Rapport research on ONE saved decision-maker, only when the owner clicks. Professional material only: the company's own website and a few public
// web pages (press, interviews, podcasts, awards). Never social platforms. Every point must quote the page it came from, and the quote is checked.
const UA = "AgencyOSBot";
const ROOT = path.resolve(process.cwd(), "..");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const rapportCap = () => Number(process.env.RAPPORT_DAILY_CAP ?? 10) || 10;

export type RapportResult = { points: RapportPoint[]; limits: string[]; created_at: string };

const titleOf = (html: string, fallback: string) => (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? fallback).replace(/\s+/g, " ").replace(/&amp;/g, "&").trim().slice(0, 120);

/** "Dr Alex J Example" -> first "Alex", last "Example". Needs at least two name parts. */
export function splitName(full: string): { first: string; last: string } | null {
  const parts = full.replace(/\b(dr|mr|mrs|ms|miss|prof|professor|sir)\b\.?/gi, " ").replace(/[(),]/g, " ").split(/\s+/).filter((p) => /^[\p{L}][\p{L}'’.-]*$/u.test(p));
  return parts.length >= 2 ? { first: parts[0], last: parts[parts.length - 1] } : null;
}

const SCHEMA = {
  type: "object" as const,
  properties: { points: { type: "array", maxItems: 4, items: { type: "object", properties: {
    kind: { type: "string", enum: ["work", "talk", "background", "role"] }, text: { type: "string" }, opener: { type: "string" }, source: { type: "number" }, quote: { type: "string" },
  }, required: ["kind", "text", "opener", "source", "quote"] } } },
  required: ["points"],
};

/** The AI step: reads the numbered sources and proposes points, then the code keeps only what it can confirm. Exported so it can be tried on made-up sources. */
export async function extractPoints(nm: { first: string; last: string }, role: string | null, companyName: string, sources: Source[]): Promise<{ points: RapportPoint[]; dropped: string[] }> {
  const rules = await readFile(path.join(ROOT, "prompts/rapport.md"), "utf8");
  const prompt = `${rules}\n\nPERSON: ${nm.first} ${nm.last}${role ? `, ${role}` : ""}\nCOMPANY: ${companyName}\n\n` +
    sources.map((s) => `SOURCE ${s.id} (${s.url}, titled "${s.title}"):\n${s.text}`).join("\n\n");
  return verifyPoints(await askStructured<unknown>(prompt, SCHEMA, rapportModel(), 2000), sources);
}

export async function runRapport(contactId: number): Promise<RapportResult> {
  const [ct] = await query<{ id: number; name: string; role: string | null; company_id: number | null; sendable: boolean; blocked: boolean }>(
    `SELECT ct.id, ct.name, ct.role, ct.company_id, cg.sendable, cg.blocked_person AS blocked FROM contacts ct JOIN contact_gate cg ON cg.contact_id = ct.id WHERE ct.id = $1`, [contactId]);
  if (!ct || !ct.company_id) throw new Error("Contact not found.");
  if (ct.blocked) throw new Error(`${ct.name} has opted out or is suppressed, so nothing is researched about them.`);
  const gate = await loadGate(ct.company_id);
  if (!gate?.sendable) throw new Error(`Rapport research is only done for verified active limited companies that can be contacted. ${gate?.reasons.join(" ") ?? ""}`.trim());
  const nm = splitName(ct.name);
  if (!nm) throw new Error("This contact needs a first and a last name before anything can be looked up.");
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM contact_rapport WHERE created_at::date = current_date`);
  if (Number(n) >= rapportCap()) throw new Error(`Today's limit of ${rapportCap()} rapport searches is used up. Try again tomorrow, or raise RAPPORT_DAILY_CAP.`);
  const [co] = await query<{ display_name: string; domain: string | null; postcode: string | null }>(`SELECT display_name, domain, postcode FROM companies WHERE id = $1`, [ct.company_id]);

  const limits: string[] = ["Social platforms (LinkedIn, Facebook, Instagram, X, TikTok, YouTube) are never read."];
  const sources: Source[] = [];
  const add = (url: string, title: string, text: string) => { sources.push({ id: sources.length + 1, url, title, text: excerptAround(maskContacts(text).text, nm.first, nm.last).slice(0, 2200) }); };

  // 1. The company's own website: pages that name this person (team, about, news).
  const domain = co.domain ? co.domain.toLowerCase().replace(/^www\./, "") : null;
  if (domain && safeDomain(domain)) {
    let read = 0;
    const take = async (host: string, p: string): Promise<string | null> => {
      if (!(await robotsAllows(host, p))) return null;
      const r = await fetchPublicHtml(`https://${host}${p}`, { userAgent: UA, timeoutMs: 9000 });
      if (!r.ok || !r.html) return null;
      read++;
      const text = visibleText(r.html);
      if (mentionsPerson(text, nm.first, nm.last)) add(r.finalUrl, titleOf(r.html, domain), text);
      return r.html;
    };
    const home = (await take(domain, "/")) ?? (await take(`www.${domain}`, "/"));
    if (home) for (const p of pickLinks(home, domain, 3)) { await sleep(1000); await take(domain, p); }
    limits.push(`Read ${read} page${read === 1 ? "" : "s"} of their own website${sources.length ? "" : "; none of them named this person"}.`);
  } else limits.push("No website is saved for this company, so its own pages were not read.");

  // 2. A web search for press, interviews, podcasts, awards. Uses search credits, inside the daily search cap.
  const usage = await creditUsage();
  if (!usage.search.enabled) limits.push("The web search was not run: SEARCH_API_KEY is not set.");
  else if (usage.search.cap - usage.search.used < 2) limits.push(`The web search was not run: today's cap of ${usage.search.cap} searches is nearly used.`);
  else {
    const town = (co.postcode ?? "").split(" ")[0];
    const seen = new Set<string>(domain ? [domain] : []);
    let external = 0;
    try {
      for (const q of [`"${nm.first} ${nm.last}" "${co.display_name}"`, `"${nm.first} ${nm.last}" ${ct.role ?? ""} ${town}`.replace(/\s+/g, " ").trim()]) {
        const hits = await braveSearch(q);
        await logActivity("search_lookup", { company_id: ct.company_id, contact_id: contactId, channel: "search", body: "Rapport research" });
        for (const h of hits) {
          if (external >= 3) break;
          let u: URL; try { u = new URL(h.url); } catch { continue; }
          const host = u.hostname.replace(/^www\./, "");
          if (u.protocol !== "https:" || !allowedSourceHost(h.url) || seen.has(host) || !safeDomain(host)) continue;
          seen.add(host);
          if (!(await robotsAllows(host, u.pathname))) continue;
          await sleep(1000);
          const r = await fetchPublicHtml(h.url, { userAgent: UA, timeoutMs: 9000 });
          if (!r.ok || !r.html) continue;
          const text = visibleText(r.html);
          if (mentionsPerson(text, nm.first, nm.last) && mentionsCompany(text, co.display_name, domain)) { add(r.finalUrl, titleOf(r.html, host), text); external++; }
        }
      }
      limits.push(`Web search: ${external} public page${external === 1 ? "" : "s"} found that name them together with the company.`);
    } catch (e) { limits.push(`The web search failed: ${e instanceof Error ? e.message : "unknown error"}.`); }
  }

  let points: RapportPoint[] = [];
  if (sources.length === 0) limits.push("Nothing public was found that names this person in a professional context, so nothing was suggested.");
  else {
    const v = await extractPoints({ first: nm.first, last: nm.last }, ct.role, co.display_name, sources);
    points = v.points;
    if (v.dropped.length) limits.push(`${v.dropped.length} suggestion${v.dropped.length === 1 ? " was" : "s were"} dropped because the check failed (${v.dropped.slice(0, 3).join("; ")}).`);
    if (points.length === 0) limits.push("No professional point could be confirmed from the pages read.");
  }

  const [row] = await query<{ created_at: Date }>(`INSERT INTO contact_rapport (contact_id, model, points, limits) VALUES ($1,$2,$3,$4) RETURNING created_at`, [contactId, rapportModel(), JSON.stringify(points), JSON.stringify(limits)]);
  await logActivity("rapport_found", { company_id: ct.company_id, contact_id: contactId, channel: "web", body: `${ct.name}: ${points.length} rapport point${points.length === 1 ? "" : "s"} from ${sources.length} public page${sources.length === 1 ? "" : "s"}` });
  return { points, limits, created_at: new Date(row.created_at).toISOString() };
}

export async function latestRapportFor(contactIds: number[]): Promise<Map<number, RapportResult>> {
  if (contactIds.length === 0) return new Map();
  const rows = await query<any>(`SELECT DISTINCT ON (contact_id) contact_id, points, limits, created_at FROM contact_rapport WHERE contact_id = ANY($1) ORDER BY contact_id, created_at DESC`, [contactIds]);
  return new Map(rows.map((r: any) => [Number(r.contact_id), { points: r.points, limits: r.limits, created_at: new Date(r.created_at).toISOString() }]));
}
