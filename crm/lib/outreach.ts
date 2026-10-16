import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

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

async function loomUrl(): Promise<string | null> {
  try {
    const offers = (parse(await readFile(path.join(ROOT, "config/offers.yaml"), "utf8"))?.offers ?? []) as { demo_path?: string; loom_url?: string }[];
    return offers.find((o) => o.demo_path === "demos/client-report")?.loom_url || null;
  } catch { return null; }
}

export async function outreachDrafts(companyName: string): Promise<{ first: Draft; followUp: Draft; social: Draft }> {
  const md = await readFile(path.join(ROOT, "prompts/outreach-email.md"), "utf8");
  const loom = await loomUrl();
  const fill = (s: string) => {
    let out = s.replaceAll("{{agency}}", shortName(companyName));
    if (process.env.SENDER_NAME) out = out.replaceAll("{{your name}}", process.env.SENDER_NAME);
    if (process.env.BUSINESS_NAME) out = out.replaceAll("{{your business}}", process.env.BUSINESS_NAME);
    if (loom) out = out.replaceAll("{{Loom link}}", loom);
    return out;
  };
  const first = section(md, "First email"), followUp = section(md, "Follow-up (once, 3-4 days later, same thread)");
  const social = section(md, "Social message (for a company page's inbox or a contact form, when there's no email)");
  return { first: { subject: fill(first.subject), body: fill(first.body) }, followUp: { subject: fill(followUp.subject), body: fill(followUp.body) }, social: { subject: "", body: fill(social.body) } };
}
