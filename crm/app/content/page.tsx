import Link from "next/link";
import { BarChart3, CalendarDays, Clapperboard, FileText, Flame, Repeat2, TrendingUp, Users } from "lucide-react";
import { query } from "@/lib/db";
import { generateIdeasAction, pipelineIdeasAction } from "@/lib/actions";
import { loadContentConfig } from "@/lib/content";
import { loadPosts } from "@/lib/contentPerformance";
import { scoreLabel } from "@/lib/contentMath";
import { audienceText, backlogState, inNiche, nicheLabel, pickNiche } from "@/lib/contentConfigMath";
import NicheFilter from "@/components/NicheFilter";
import ContentBoard from "@/components/ContentBoard";
import ActionForm from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Content" };

export default async function Content({ searchParams }: { searchParams: Promise<{ more?: string; niche?: string }> }) {
  const sp = await searchParams;
  const override = sp.more === "1";
  const [rows, config, posts, deals] = await Promise.all([
    query<any>(`SELECT id, idea, hook, hook_alt AS "hookAlt", format, status, keyword, niche, scheduled_for::text AS day FROM content_items ORDER BY created_at DESC, id DESC`),
    loadContentConfig(),
    loadPosts(),
    query<any>(`SELECT d.id, d.title, c.display_name FROM deals d JOIN companies c ON c.id = d.company_id WHERE d.stage <> 'Lost' AND EXISTS (SELECT 1 FROM company_research r WHERE r.company_id = c.id AND jsonb_array_length(r.findings) > 0) ORDER BY d.updated_at DESC LIMIT 30`),
  ]);
  const niche = pickNiche(sp.niche, config.niches);
  const live = rows.filter((r: any) => r.status !== "Archived");
  const counts: Record<string, number> = { all: live.length, untagged: inNiche(live, "untagged").length, ...Object.fromEntries(config.niches.map((n) => [n, inNiche(live, n).length])) };
  const items = inNiche(rows, niche).map((r: any) => ({ ...r, scoreLines: posts.filter((p) => p.content_item_id === Number(r.id)).map((p) => scoreLabel(p.platform, p.performance)) }));
  const open = items.filter((i: any) => i.status === "Idea").length;
  const gate = backlogState(open, config.max_open_ideas, override);
  return (
    <>
      <PageHeader
        title="Content"
        description="Ideas become scripts, then get filmed and posted. Click a card for details, or drag it to another stage."
        actions={
          <>
            <Link href="/content/insights" className="btn secondary"><BarChart3 size={16} aria-hidden /> What's working</Link>
            <Link href="/content/film" className="btn secondary"><Clapperboard size={16} aria-hidden /> Filming day</Link>
            <Link href="/content/brief" className="btn secondary"><FileText size={16} aria-hidden /> Weekly brief</Link>
            <Link href="/content/trends" className="btn secondary"><Flame size={16} aria-hidden /> Trends</Link>
            <Link href="/content/creators" className="btn secondary"><Users size={16} aria-hidden /> Creators</Link>
            <Link href="/content/outliers" className="btn secondary"><TrendingUp size={16} aria-hidden /> Outliers</Link>
            <Link href="/content/calendar" className="btn secondary"><CalendarDays size={16} aria-hidden /> Calendar</Link>
            <Link href="/content/repurpose" className="btn secondary"><Repeat2 size={16} aria-hidden /> Repurpose a transcript</Link>
          </>
        }
      />
      <details className="card" style={{ marginBottom: 16 }}>
        <summary>Generate 10 video ideas{gate.blocked && <span className="muted"> · paused, {open} waiting</span>}</summary>
        <p className="muted" style={{ marginTop: 12 }}>Ideas are built from your best posts, the outliers you broke down, trends you noted and patterns across the businesses you researched, spread across your weekly mix. Each is scored; anything under 5 is set aside. Your niches are set in <code>content:</code> in config/niches.yaml ({audienceText(config)}).</p>
        {gate.blocked ? (
          <p role="status" style={{ marginTop: 8 }}>
            {gate.message} <Link href="/content?more=1">Generate anyway</Link>
          </p>
        ) : (
          <ActionForm action={generateIdeasAction} label="Generate 10 ideas" busyLabel="Generating and scoring… (about 30 seconds)" style={{ marginTop: 12, maxWidth: 520 }}>
            {override && <input type="hidden" name="override" value="1" />}
            <label className="field-label" htmlFor="gen-niche">Make them for</label>
            <select id="gen-niche" name="niche" defaultValue={niche === "all" || niche === "untagged" ? "all" : niche}>
              <option value="all">All my niches, mixed</option>
              {config.niches.map((n) => <option key={n} value={n}>{nicheLabel(n)} only</option>)}
            </select>
            <input name="steer" placeholder="Anything specific? (optional), e.g. missed calls, or quote follow-up" aria-label="Steer" />
          </ActionForm>
        )}
        <h3 style={{ marginTop: 16 }}>Pipeline content</h3>
        <p className="muted">Three ideas from one deal's research. They describe the pattern (for example "most dental sites I looked at had no enquiry form") and never name the business.</p>
        {deals.length === 0 ? <p className="muted">No deals with saved research yet. Run the research on a company page first.</p> : (
          <ActionForm action={pipelineIdeasAction} label="Write 3 ideas" busyLabel="Writing… (about 15 seconds)" style={{ marginTop: 8, maxWidth: 520 }}>
            <select name="deal_id" aria-label="Deal" defaultValue="">
              <option value="" disabled>Choose a deal…</option>
              {deals.map((d: any) => <option key={d.id} value={d.id}>{d.display_name}: {d.title}</option>)}
            </select>
          </ActionForm>
        )}
      </details>
      <NicheFilter base="/content" niches={config.niches} current={niche} counts={counts} keep={override ? { more: "1" } : {}} />
      <ContentBoard initial={items} platforms={config.platforms} niches={config.niches} />
    </>
  );
}
