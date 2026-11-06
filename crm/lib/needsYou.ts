import { existsSync } from "node:fs";
import path from "node:path";
import { query } from "./db";
import { ago } from "./format";
import { CHECKPOINTS_END_HOURS, PLATFORM_LABEL, dueCheckpoint, type Bucket, type Platform } from "./contentMath";
import { dueForSession, loadTraining } from "./enablementData";
import { loadOutcomes, needsAttention } from "./outcomeData";
import { proposalName } from "./proposalName";
import { describeNeeds, isDemoFolder, shortTitle } from "./needsYouMath";

// The one place that says what is outstanding. A number is never stored or marked as read: it is worked out from the data each time,
// so it goes down by itself when the thing is done. The Inbox count stays in ReplyFeed, which also announces new replies.

export type NeedItem = { key: string; title: string; detail: string; href: string; action: string };
export type NeedGroup = { heading: string; one: string; many: string; items: NeedItem[] };
export type NeedCount = { n: number; text: string };
type Rule = Omit<NeedGroup, "items"> & { load: () => Promise<NeedItem[]> };

const ROOT = path.resolve(process.cwd(), "..");
const TODAY_UK = `(now() AT TIME ZONE 'Europe/London')::date`;
const shortDate = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const NUMBERS_NAME: Record<Bucket, string> = { 24: "24-hour", 72: "72-hour", 168: "7-day" };

const tasksDue: Rule = {
  heading: "Tasks due", one: "task due or overdue", many: "tasks due or overdue",
  // The same rule as the Dashboard's Tasks due and the Tasks page's Overdue and Today groups.
  load: async () => (await query<any>(
    `SELECT id, title, due_at FROM tasks WHERE done_at IS NULL AND due_at < now()::date + 1 ORDER BY due_at`))
    .map((t) => ({ key: `task-${t.id}`, title: t.title, detail: `Due ${shortDate(t.due_at)}`, href: "/tasks", action: "Open" })),
};

const dealsGoingQuiet: Rule = {
  heading: "Going quiet", one: "deal with no activity for 3 days", many: "deals with no activity for 3 days",
  // The same rule as Deals going quiet on the Dashboard.
  load: async () => (await query<any>(
    `SELECT id, title, stage::text AS stage, updated_at FROM deals
      WHERE stage IN ('Contacted','Replied','Call booked','Audit sold','Proposal sent') AND updated_at < now() - interval '3 days' ORDER BY updated_at`))
    .map((d) => ({ key: `deal-${d.id}`, title: d.title, detail: `${d.stage} · last touched ${ago(d.updated_at)}`, href: `/deals/${d.id}`, action: "Follow up" })),
};

const pitchLooms: Rule = {
  heading: "Pitch Looms to record", one: "pitch Loom to record", many: "pitch Looms to record",
  // Owed once a pitch pack or Loom pitch has scripted one. Marking it recorded, or pasting the link, clears it, and so does the proposal leaving Draft (sent without one, or dropped).
  load: async () => (await query<any>(
    `SELECT id, job_title, company_name, loom_pitch IS NOT NULL AS is_loom_pitch, COALESCE(loom_pitch_at, pack_at) AS written_at FROM proposals
      WHERE (pack IS NOT NULL OR loom_pitch IS NOT NULL) AND status = 'Draft' AND loom_recorded_at IS NULL ORDER BY written_at`))
    .map((p) => ({ key: `proposal-${p.id}`, title: shortTitle(proposalName(p)), detail: `Script written ${ago(p.written_at)}`, href: `/proposals/${p.id}#${p.is_loom_pitch ? "loom-pitch" : "loom-script"}`, action: "Record" })),
};

const callsToAnalyse: Rule = {
  heading: "Calls to analyse", one: "call to analyse", many: "calls to analyse",
  load: async () => (await query<any>(
    `SELECT c.id, c.title, c.status, c.occurred_at, co.name AS company FROM calls c JOIN companies co ON co.id = c.company_id
      WHERE c.status IN ('saved', 'failed') AND c.transcript IS NOT NULL ORDER BY c.occurred_at`))
    .map((c) => ({ key: `call-${c.id}`, title: c.title, detail: `${c.company} · ${shortDate(c.occurred_at)}${c.status === "failed" ? " · the last try failed" : ""}`, href: `/calls/${c.id}`, action: "Analyse" })),
};

const quoteDrafts: Rule = {
  heading: "Quotes not sent", one: "quote not sent", many: "quotes not sent",
  load: async () => (await query<any>(
    `SELECT q.id, q.created_at, d.title FROM quotes q LEFT JOIN deals d ON d.id = q.deal_id WHERE q.status = 'Draft' ORDER BY q.created_at`))
    .map((q) => ({ key: `quote-${q.id}`, title: q.title ?? `Quote #${q.id}`, detail: `Drafted ${ago(q.created_at)}`, href: `/quotes/${q.id}`, action: "Finish" })),
};

const reviewsDue: Rule = {
  heading: "Reviews due", one: "client review due", many: "client reviews due",
  load: async () => (await query<any>(
    `SELECT s.id, s.next_review_date, c.name AS company, o.name AS service
       FROM client_services s JOIN companies c ON c.id = s.company_id LEFT JOIN offers o ON o.id = s.offer_id
      WHERE s.status = 'Active' AND s.next_review_date <= ${TODAY_UK} ORDER BY s.next_review_date`))
    .map((s) => ({ key: `review-${s.id}`, title: s.company, detail: `${s.service ?? "Service"} · review was due ${shortDate(s.next_review_date)}`, href: `/clients#service-${s.id}`, action: "Review" })),
};

const outcomesAtRisk: Rule = {
  heading: "Need attention", one: "outcome needs attention", many: "outcomes need attention",
  // The Outcomes page lists these itself, so they only feed the number.
  load: async () => (await loadOutcomes()).filter(needsAttention)
    .map((l) => ({ key: `outcome-${l.outcome.id}`, title: l.outcome.company_name, detail: l.outcome.title, href: `/outcomes/${l.outcome.id}`, action: "Open" })),
};

const trainingOverdue: Rule = {
  heading: "Overdue a session", one: "client overdue a session", many: "clients overdue a session",
  // The Enablement page lists these itself, so they only feed the number.
  load: async () => dueForSession(await loadTraining())
    .map((r) => ({ key: `training-${r.id}`, title: r.name, detail: r.status.label, href: `/enablement/${r.id}`, action: "Open" })),
};

const postNumbers: Rule = {
  heading: "Post numbers to enter", one: "post needs its numbers", many: "posts need their numbers",
  load: async () => {
    const rows = await query<any>(
      `SELECT p.id, p.platform, p.posted_at, p.content_item_id, c.idea, extract(epoch FROM now() - p.posted_at) / 3600 AS age,
              COALESCE(array_agg(m.bucket) FILTER (WHERE m.bucket IS NOT NULL), '{}') AS saved
         FROM posts p JOIN content_items c ON c.id = p.content_item_id LEFT JOIN post_metrics m ON m.post_id = p.id
        WHERE p.posted_at > now() - make_interval(hours => $1) AND c.status <> 'Archived'
        GROUP BY p.id, c.idea ORDER BY p.posted_at`, [CHECKPOINTS_END_HOURS]);
    return rows.flatMap((p) => {
      const bucket = dueCheckpoint(Number(p.age), (p.saved as (number | string)[]).map(Number));
      if (bucket === null) return [];
      return [{
        key: `post-${p.id}`, title: shortTitle(p.idea),
        detail: `${PLATFORM_LABEL[p.platform as Platform] ?? p.platform} · ${NUMBERS_NAME[bucket]} numbers · posted ${ago(p.posted_at)}`,
        href: `/content?open=${p.content_item_id}&post=${p.id}&bucket=${bucket}`, action: "Enter numbers",
      }];
    });
  },
};

const videosPastDate: Rule = {
  heading: "Past their posting date", one: "video past its posting date", many: "videos past their posting date",
  // The same rule as Scripts overdue on the Dashboard.
  load: async () => (await query<any>(
    `SELECT id, idea, status, scheduled_for::text AS day FROM content_items
      WHERE scheduled_for < ${TODAY_UK} AND status NOT IN ('Posted','Archived') ORDER BY scheduled_for`))
    .map((c) => ({ key: `content-${c.id}`, title: shortTitle(c.idea), detail: `${c.status} · planned for ${shortDate(`${c.day}T12:00:00`)}`, href: `/content?open=${c.id}`, action: "Open" })),
};

const demoLooms: Rule = {
  heading: "Demo Looms to record", one: "demo Loom to record", many: "demo Looms to record",
  // Only a demo that has actually been built: an offer can name a demo folder long before it exists, and that cannot be filmed yet.
  load: async () => (await query<any>(
    `SELECT id, name, demo_path FROM offers
      WHERE active AND NOT is_bundle AND COALESCE(loom_url, '') = '' AND COALESCE(demo_path, '') <> '' ORDER BY sort_order, name`))
    .filter((o) => isDemoFolder(o.demo_path) && existsSync(path.join(ROOT, o.demo_path.trim())))
    .map((o) => {
      const script = path.join(o.demo_path.trim(), "loom-script.md");
      return { key: `offer-${o.id}`, title: o.name, detail: existsSync(path.join(ROOT, script)) ? `Script in ${script}, then paste the link here` : `Built in ${o.demo_path.trim()}, then paste the link here`, href: `/offers#offer-${o.id}`, action: "Add link" };
    }),
};

// Keys are the sidebar links (components/nav-items.ts): a number shows against the page where it gets dealt with.
const CATEGORIES: Record<string, Rule[]> = {
  "/tasks": [tasksDue],
  "/deals": [dealsGoingQuiet],
  "/proposals": [pitchLooms],
  "/calls": [callsToAnalyse],
  "/quotes": [quoteDrafts],
  "/clients": [reviewsDue],
  "/outcomes": [outcomesAtRisk],
  "/enablement": [trainingOverdue],
  "/content": [postNumbers, videosPastDate],
  "/offers": [demoLooms],
};

// One rule failing (the database waking up, a table not migrated yet) leaves the other numbers and the page itself working.
async function run(rule: Rule): Promise<NeedGroup & { failed?: boolean }> {
  const { load, ...wording } = rule;
  try { return { ...wording, items: await load() }; }
  catch (err) {
    console.error(`Needs you: "${rule.heading}" failed: ${err instanceof Error ? err.message : String(err)}`);
    return { ...wording, items: [], failed: true };
  }
}

/** What one page's number is made of, with only the groups that have something in them. */
export async function loadNeedsFor(href: string): Promise<NeedGroup[]> {
  return (await Promise.all((CATEGORIES[href] ?? []).map(run))).filter((g) => g.items.length > 0);
}

/**
 * Every sidebar number, with counts and wording only, no names or titles. `failed` lists the categories that could not be checked this time,
 * so the tab keeps their last number: a badge vanishing would read as "all clear" when it is not.
 */
export async function loadNeedCounts(): Promise<{ counts: Record<string, NeedCount>; failed: string[] }> {
  const entries = await Promise.all(Object.entries(CATEGORIES).map(async ([href, rules]) => {
    const groups = await Promise.all(rules.map(run));
    const n = groups.reduce((sum, g) => sum + g.items.length, 0);
    const text = describeNeeds(groups.map((g) => ({ n: g.items.length, one: g.one, many: g.many })));
    return { href, count: { n, text }, failed: groups.some((g) => g.failed) };
  }));
  return {
    counts: Object.fromEntries(entries.filter((e) => e.count.n > 0).map((e) => [e.href, e.count])),
    failed: entries.filter((e) => e.failed).map((e) => e.href),
  };
}
