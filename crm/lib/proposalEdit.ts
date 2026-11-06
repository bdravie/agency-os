// Checks for editing a proposal's details (pure, so it can be tested). The Upwork link must be a plain https address;
// the job text must still be a real job post, because the fit score, plan and Loom pitch are all written from it.

export const TITLE_MAX = 200;
export const COMPANY_MAX = 120;
export const URL_MAX = 500;
export const JOB_MIN = 40;
export const JOB_MAX = 20000;

export type ProposalDetails = { job_title: string | null; company_name: string | null; job_url: string | null; job_text: string };

const clean = (s: unknown) => String(s ?? "").trim();

/** The tidy values to save, or an error message. An empty title, company or link is stored as nothing. */
export function cleanDetails(raw: { job_title?: unknown; company_name?: unknown; job_url?: unknown; job_text?: unknown }): { ok: true; value: ProposalDetails } | { ok: false; error: string } {
  const title = clean(raw.job_title).replace(/\s+/g, " ");
  const company = clean(raw.company_name).replace(/\s+/g, " ");
  const url = clean(raw.job_url);
  const text = clean(raw.job_text);
  if (title.length > TITLE_MAX) return { ok: false, error: `Keep the job title under ${TITLE_MAX} characters.` };
  if (company.length > COMPANY_MAX) return { ok: false, error: `Keep the company name under ${COMPANY_MAX} characters.` };
  if (url) {
    if (url.length > URL_MAX) return { ok: false, error: "That link is too long." };
    let u: URL;
    try { u = new URL(url); } catch { return { ok: false, error: "The Upwork link must be a full web address starting with https://" }; }
    if (u.protocol !== "https:") return { ok: false, error: "The Upwork link must start with https://" };
  }
  if (text.length < JOB_MIN) return { ok: false, error: "The job post needs at least a few sentences." };
  if (text.length > JOB_MAX) return { ok: false, error: "That job post is too long." };
  return { ok: true, value: { job_title: title || null, company_name: company || null, job_url: url || null, job_text: text } };
}
