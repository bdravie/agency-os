// How a proposal is named in lists and headings: the job title, plus the company when there is one.

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** The job title when none was typed: the first real line of the pasted job post, shortened. */
export function titleFromJob(jobText: string): string | null {
  const line = jobText.split("\n").map(clean).find((l) => l.length >= 4 && !/^(summary|description|job description|overview)$/i.test(l));
  if (!line) return null;
  const t = line.replace(/^(upwork )?(job )?(posting|post|title)\s*:\s*/i, "");
  return t.length > 90 ? t.slice(0, 87).trimEnd() + "…" : t;
}

/** "Job title · Company", or just the title, or "Proposal #n" when there is nothing else. */
export function proposalName(p: { id: number | string; job_title?: string | null; company_name?: string | null }): string {
  const title = clean(p.job_title ?? "");
  const company = clean(p.company_name ?? "");
  if (title && company) return `${title} · ${company}`;
  return title || company || `Proposal #${p.id}`;
}
