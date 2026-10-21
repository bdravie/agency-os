// Pure logic for turning an AI offer suggestion into a deal: the best way to reach the company, a written plan, and the first tasks. No database.
import type { Suggestion } from "./offerSuggestNormalise.ts";

export type Route = { kind: "named_email" | "generic_email" | "instagram" | "contact_form" | "phone" | "linkedin" | "facebook"; label: string; channel: "email" | "social_dm" | null; contactId?: number };
export type ContactInput = { id: number; name: string; role: string | null; email: string | null; opted_out: boolean };
export type CompanyInput = { sendable: boolean; blockedReason?: string; generic_email: string | null; instagram_url: string | null; linkedin_url: string | null; facebook_url: string | null; contact_url: string | null; phone: string | null; contacts: ContactInput[] };

/** Every way to reach the company, best first. Empty when the company may not be contacted at all. Named decision-makers come before generic inboxes, and the first message goes by email or Instagram DM before a call. */
export function contactRoutes(c: CompanyInput): Route[] {
  if (!c.sendable) return [];
  const routes: Route[] = [];
  for (const p of c.contacts) if (p.email && !p.opted_out) routes.push({ kind: "named_email", label: `Email ${p.name}${p.role ? ` (${p.role})` : ""} directly`, channel: "email", contactId: p.id });
  if (c.generic_email) routes.push({ kind: "generic_email", label: `Email the company inbox (${c.generic_email})`, channel: "email" });
  if (c.instagram_url) routes.push({ kind: "instagram", label: "Instagram DM from the company page", channel: "social_dm" });
  if (c.contact_url) routes.push({ kind: "contact_form", label: "The contact form on their website", channel: null });
  if (c.phone) routes.push({ kind: "phone", label: "Phone the company (check it isn't on the CTPS register first)", channel: null });
  if (c.linkedin_url) routes.push({ kind: "linkedin", label: "Message their LinkedIn company page", channel: null });
  if (c.facebook_url) routes.push({ kind: "facebook", label: "Message their Facebook page", channel: null });
  return routes;
}

export type PlanInput = {
  companyName: string; suggestion: Suggestion; findingTitles: string[]; opener: string | null; questions: string[];
  routes: Route[]; blockedReason?: string; date: string;
};

/** A plain-text plan saved on the deal as a note. It only rearranges what the suggestion and research already say. */
export function buildPlan(i: PlanInput): string {
  const s = i.suggestion, best = i.routes[0], rest = i.routes.slice(1);
  const L: string[] = [`DEAL PLAN: ${s.title} (${i.companyName})`, `From an AI offer suggestion, ${i.date}. These are ideas to check, not facts.`, ""];
  L.push("GOAL", s.outcome, "", "WHAT TO PITCH", s.automation + (s.offer_name ? `\nCatalogue offer: ${s.offer_name}` : ""), "");
  L.push("WHY THIS COMPANY", s.why, i.findingTitles.length ? `Based on: ${i.findingTitles.join("; ")}` : "Not tied to a finding, so treat it as a guess.", "");
  L.push("BEST WAY TO CONTACT THEM");
  if (best) L.push(`${best.label}.`, ...(rest.length ? [`Fallbacks: ${rest.map((r) => r.label).join("; ")}.`] : []));
  else L.push(i.blockedReason ? `Don't contact them yet. ${i.blockedReason}` : "No contact route is saved yet. Add one under Contact details on the company page.");
  L.push("");
  const step: string[] = [];
  if (best) step.push(`Send a short first message by hand${best.channel === "email" ? " (use the Outreach draft)" : best.channel === "social_dm" ? " (use the Instagram DM draft)" : ""}, signed with your real name, business name and the opt-out line.${i.opener ? ` A true opening line: ${i.opener}` : ""}`);
  step.push("If they reply, book a short call.", ...(i.questions.length ? [`Questions for the call: ${i.questions.join(" / ")}`] : []));
  step.push(`Offer a small first step: ${s.pilot}`, `Agree how success is measured: ${s.kpi}`, "Turn it into a quote, then move the deal on.");
  L.push("STEPS", ...step.map((t, n) => `${n + 1}. ${t}`), "");
  L.push("WATCH OUT", s.risk + (s.needs_dpa ? "\nThis would handle their customers' personal data: a data processing agreement is needed first." : ""));
  return L.join("\n").slice(0, 6000);
}

export type PlanTask = { title: string; dueInDays: number };
/** The first two tasks on the deal. None when the company can't be contacted. */
export function planTasks(routes: Route[]): PlanTask[] {
  const best = routes[0];
  return best ? [{ title: `First contact: ${best.label}`, dueInDays: 2 }, { title: "Follow-up if no reply", dueInDays: 7 }] : [];
}
