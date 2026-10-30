// Pure rules for the per-niche outreach templates in prompts/outreach/<niche>.md. No files, no AI.

export const FIRST = "First email";
export const FOLLOW = "Follow-up (once, 3-4 days later, same thread)";
export const SOCIAL = "Social message (for a company page's inbox or a contact form, when there's no email)";
export const OPT_OUT = /reply\s+"no"\s+and i won't (email|message) again/i;

/** A niche key becomes a file name, so only plain keys are accepted ("HVAC" -> "hvac"). Anything else returns null: no path tricks. */
export function templateKey(niche: string | null | undefined): string | null {
  const k = String(niche ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return /^[a-z][a-z0-9_]{1,39}$/.test(k) ? k : null;
}

/** "<!-- offer: home_services -->" names which group of offers.yaml this template pitches, so the right demo link can be filled in. */
export const offerGroup = (md: string): string | null => md.match(/<!--\s*offer:\s*([a-z0-9_]+)\s*-->/i)?.[1].toLowerCase() ?? null;
export const isStarter = (md: string) => /<!--\s*starter\b/i.test(md);
export const isAiWritten = (md: string) => /<!--\s*written by AI\b/i.test(md);

function section(md: string, heading: string): string | null {
  const start = md.indexOf(`## ${heading}`);
  if (start < 0) return null;
  return md.slice(start + heading.length + 3).split(/\n## /)[0];
}
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Problems that would make a template unsafe or unusable. An empty list means it is fine to use. */
export function templateProblems(md: string): string[] {
  const bad: string[] = [];
  for (const [name, h] of [["First email", FIRST], ["Follow-up", FOLLOW], ["Social message", SOCIAL]] as const) {
    const text = section(md, h);
    if (text === null) { bad.push(`The "${name}" section is missing, or its heading was changed.`); continue; }
    if (!OPT_OUT.test(text)) bad.push(`The ${name.toLowerCase()} needs the opt-out line: Reply "no" and I won't ${name === "Social message" ? "message" : "email"} again.`);
    if (!/\{\{your name\}\}/.test(text) || !/\{\{your business\}\}/.test(text)) {
      if (name !== "Follow-up" || !/\{\{your name\}\}/.test(text)) bad.push(`The ${name.toLowerCase()} needs {{your name}} and {{your business}}.`);
    }
    if (/\{\{agency\}\}/.test(text)) bad.push(`The ${name.toLowerCase()} still uses {{agency}}. Use {{company}}.`);
  }
  const first = section(md, FIRST);
  if (first) {
    const subject = first.match(/\*\*Subject:\*\*\s*(.+)/)?.[1].trim() ?? "";
    if (!subject) bad.push("The first email has no subject.");
    else if (subject.length > 30) bad.push(`The first email's subject is ${subject.length} characters. Keep it to 30 or fewer.`);
    const body = first.replace(/\*\*Subject:\*\*.*\n?/, "").replace(/\{\{your name\}\}, \{\{your business\}\}\s*\n?\s*Reply[^\n]*/i, "");
    if (wordCount(body) > 100) bad.push(`The first email body is ${wordCount(body)} words. Keep it under 100.`);
  }
  return bad;
}

/** A first draft for a brand-new niche, so it never falls back to someone else's wording. It is marked as a starter until you or the AI write real copy. */
export function starterTemplate(label: string, offer: string | null): string {
  const what = (offer ?? "").trim().replace(/[.\s]+$/, "") || "a weekly one-page email of your own business numbers";
  return `<!-- starter: replace this with copy written for ${label}. Use "Write copy with AI" in Add or manage niches, or edit by hand. -->
# Outreach email: ${label}

Send by hand from your own mailbox. Never automate. Limited companies only. Check the suppression list first.

## ${FIRST}

**Subject:** A quick idea

Hi {{company}} team,

Your {{specific thing on their site}} caught my attention because {{genuine reason}}. I'm {{your name}} at {{your business}}: I help ${label.toLowerCase()} businesses with ${what.charAt(0).toLowerCase()}${what.slice(1)}.

Would 15 minutes this week be useful? I'd run it free on one example, so you can judge it yourself.

{{your name}}, {{your business}}
Reply "no" and I won't email again.

## ${FOLLOW}

**Subject:** Re: A quick idea

Hi {{company}} team, a quick nudge in case this got buried. Happy to run it free on one example. If it's not relevant, reply "no" and I won't email again.

{{your name}}, {{your business}}

## ${SOCIAL}

Hi {{company}} team, I'm {{your name}} at {{your business}}. {{One true, specific line about them}} I help ${label.toLowerCase()} businesses with ${what.charAt(0).toLowerCase()}${what.slice(1)}. Happy to run it free on one example if it's useful. Reply "no" and I won't message again.
`;
}
