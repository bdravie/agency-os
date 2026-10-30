import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { offerGroup, templateKey } from "./outreachTemplateMath.ts";

// Reads the editable template in prompts/outreach-email.md and fills the placeholders we know.
const ROOT = path.resolve(process.cwd(), "..");

export type Draft = { subject: string; body: string };

function section(md: string, heading: string): Draft {
  const start = md.indexOf(`## ${heading}`);
  if (start < 0) throw new Error(`Template section "${heading}" not found in prompts/outreach-email.md`);
  const rest = md.slice(start + heading.length + 3);
  const text = rest.split(/\n## /)[0];
  const subject = text.match(/\*\*Subject:\*\*\s*(.+)/)?.[1].trim() ?? "";
  const body = text.replace(/\*\*Subject:\*\*.*\n?/, "").trim();
  return { subject, body };
}

export const shortName = (name: string) => name.replace(/[.,]?\s+(limited|ltd\.?|llp|plc)$/i, "").trim();

type OfferRow = { niche?: string; demo_path?: string; loom_url?: string };
/** The demo link for a template: the first offer in its group that has a Loom, or (for the old default template) the client-report demo. */
async function loomUrl(group: string | null): Promise<string | null> {
  try {
    const offers = (parse(await readFile(path.join(ROOT, "config/offers.yaml"), "utf8"))?.offers ?? []) as OfferRow[];
    return (group ? offers.find((o) => o.niche === group && o.loom_url) : offers.find((o) => o.demo_path === "demos/client-report"))?.loom_url || null;
  } catch { return null; }
}

/** prompts/outreach/<niche>.md when there is one for this niche, otherwise the default prompts/outreach-email.md. */
async function loadTemplate(niche: string | null | undefined): Promise<{ md: string; used: string | null }> {
  const key = templateKey(niche);
  if (key) { try { return { md: await readFile(path.join(ROOT, "prompts/outreach", `${key}.md`), "utf8"), used: key }; } catch { /* no template for this niche yet */ } }
  return { md: await readFile(path.join(ROOT, "prompts/outreach-email.md"), "utf8"), used: null };
}

export async function outreachDrafts(companyName: string, opts: { firstName?: string | null; niche?: string | null } = {}): Promise<{ first: Draft; followUp: Draft; social: Draft; template: string | null }> {
  const { md, used } = await loadTemplate(opts.niche);
  const loom = await loomUrl(offerGroup(md));
  const fill = (s: string) => {
    let out = opts.firstName ? s.replaceAll("Hi {{company}} team", `Hi ${opts.firstName}`).replaceAll("Hi {{agency}} team", `Hi ${opts.firstName}`) : s;
    out = out.replaceAll("{{company}}", shortName(companyName)).replaceAll("{{agency}}", shortName(companyName));
    if (process.env.SENDER_NAME) out = out.replaceAll("{{your name}}", process.env.SENDER_NAME);
    if (process.env.BUSINESS_NAME) out = out.replaceAll("{{your business}}", process.env.BUSINESS_NAME);
    if (loom) out = out.replaceAll("{{Loom link}}", loom);
    return out;
  };
  const first = section(md, "First email"), followUp = section(md, "Follow-up (once, 3-4 days later, same thread)");
  const social = section(md, "Social message (for a company page's inbox or a contact form, when there's no email)");
  return { first: { subject: fill(first.subject), body: fill(first.body) }, followUp: { subject: fill(followUp.subject), body: fill(followUp.body) }, social: { subject: "", body: fill(social.body) }, template: used };
}
