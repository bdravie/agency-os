import Link from "next/link";
import { Clapperboard, Film, Image as ImageIcon, PlayCircle, Plus, Repeat2, Video } from "lucide-react";
import { query } from "@/lib/db";
import { generateIdeasAction, pipelineIdeasAction } from "@/lib/actions";
import { loadContentConfig } from "@/lib/content";
import { loadPosts } from "@/lib/contentPerformance";
import { scoreLabel } from "@/lib/contentMath";
import { audienceText, backlogState, inNiche, nicheLabel, pickNiche } from "@/lib/contentConfigMath";
import { loadInsights } from "@/lib/contentInsights";
import NicheFilter from "@/components/NicheFilter";
import ContentBoard from "@/components/ContentBoard";
import ContentTabs from "@/components/ContentTabs";
import QuickCaptureBox from "@/components/QuickCaptureBox";
import FootageManager from "@/components/FootageManager";
import ThumbnailBuilder from "@/components/ThumbnailBuilder";
import FollowerTracker from "@/components/FollowerTracker";
import LinkedInPanel, { type LinkedInRow } from "@/components/LinkedInPanel";
import LinkedInInsights from "@/components/LinkedInInsights";
import LinkedInSwipe, { type SwipeRow } from "@/components/LinkedInSwipe";
import { loadLinkedInInsights } from "@/lib/linkedinInsights";
import LinkedInAccountCard, { type AccountState } from "@/components/LinkedInAccountCard";
import { getLinkedInConnection } from "@/lib/linkedinApi";
import { dailyCap, linkedinConfigured, tokenUsable } from "@/lib/linkedinApiMath";
import { LINKEDIN_FORMAT, openingLine, postStage, wordCount } from "@/lib/linkedinMath";
import { loadFollowerDashboard } from "@/lib/followerTracking";
import { calculateChecklistProgress } from "@/lib/quickCaptureMath";
import NeedsYouCard from "@/components/NeedsYouCard";
import ActionForm from "@/components/ActionForm";
import { Badge, EmptyState, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Content dashboard" };

export default async function Content({ searchParams }: { searchParams: Promise<{ tab?: string; more?: string; niche?: string; open?: string; post?: string; bucket?: string; stage?: string; view?: string; linkedin?: string; name?: string; reason?: string }> }) {
  const sp = await searchParams;
  // A link that opens a video (?open=, e.g. "Enter numbers" in the sidebar card) needs the Board, the only tab with the drawer.
  const tab = sp.tab && ["overview", "board", "projects", "linkedin", "followers", "footage", "thumbnails"].includes(sp.tab) ? sp.tab : sp.open ? "board" : "overview";
  const override = sp.more === "1";
  const validStages: Record<string, string> = {
    all: "all",
    idea: "Idea",
    ideas: "Idea",
    scripted: "Scripted",
    script: "Scripted",
    "script-ready": "Scripted",
    "script ready": "Scripted",
    filmed: "Filmed",
    film: "Filmed",
    posted: "Posted",
    post: "Posted",
    archived: "Archived",
    archive: "Archived",
  };
  const askedStage = (sp.stage ?? "").toLowerCase().trim();
  const currentStage = validStages[askedStage] ?? "all";
  const [rows, config, posts, deals, ins, [latestBrief], clips, renames, thumbnails, followers] = await Promise.all([
    query<any>(`SELECT i.id, i.idea, i.hook, i.hook_alt AS "hookAlt", i.format, i.status, i.keyword, i.niche, i.notes,
                       i.scheduled_for::text AS day, p.checklist, p.raw_notes, p.summary
                FROM content_items i
                LEFT JOIN content_projects p ON p.content_item_id = i.id
                ORDER BY i.created_at DESC, i.id DESC`),
    loadContentConfig(),
    loadPosts(),
    query<any>(`SELECT d.id, d.title, c.display_name FROM deals d JOIN companies c ON c.id = d.company_id WHERE d.stage <> 'Lost' AND EXISTS (SELECT 1 FROM company_research r WHERE r.company_id = c.id AND jsonb_array_length(r.findings) > 0) ORDER BY d.updated_at DESC LIMIT 30`),
    loadInsights("all"),
    query<any>(`SELECT week_start::text, prose, numbers FROM content_briefs ORDER BY week_start DESC LIMIT 1`),
    query<any>(`SELECT id, folder_path, current_name, original_name, suggested_name, clip_type,
                       duration_s, resolution, fps, frame_path, ai_label, ai_confidence,
                       used_in_project_id, renamed_at::text
                FROM footage_clips ORDER BY created_at DESC LIMIT 100`).catch(() => []),
    query<any>(`SELECT id, clip_id, folder_path, old_name, new_name, undone_at::text, created_at::text
                FROM footage_renames ORDER BY created_at DESC LIMIT 20`).catch(() => []),
    query<any>(`SELECT id, content_item_id, clip_id, format, headline, subhead, frame_url, design,
                       contrast_ratio, performance_score, platform_risk, risk_reasons, selected,
                       created_at::text
                FROM content_thumbnails ORDER BY created_at DESC LIMIT 60`).then((rows) =>
      rows.map((r: any) => ({
        ...r,
        id: Number(r.id),
        content_item_id: Number(r.content_item_id),
        clip_id: r.clip_id ? Number(r.clip_id) : null,
        contrast_ratio: r.contrast_ratio != null ? Number(r.contrast_ratio) : null,
      }))
    ).catch(() => []),
    loadFollowerDashboard().catch(() => []),
  ]);
  // The logo library for covers, only read when that tab is open.
  const coverAssets = tab === "thumbnails" ? (await query<any>(`SELECT id, name FROM thumbnail_assets ORDER BY lower(name)`).catch(() => [])).map((a: any) => ({ id: Number(a.id), name: a.name as string })) : [];
  // LinkedIn posts (content items with the LinkedIn format) and how far each has got, only read when that tab is open.
  // The LinkedIn tab has three views: the posts, What's working on LinkedIn, and the swipe file.
  const liView = sp.view === "working" || sp.view === "swipe" ? sp.view : "posts";
  const liInsights = tab === "linkedin" && liView === "working" ? await loadLinkedInInsights() : null;
  const swipes: SwipeRow[] = tab === "linkedin" && liView === "swipe" ? (await query<any>(
    `SELECT p.id, p.url, p.caption, p.post_type, p.likes, p.comments, p.shares, p.posted_at, p.breakdown, c.handle, c.display_name, c.why_i_follow
       FROM creator_posts p JOIN creators c ON c.id = p.creator_id WHERE p.platform = 'linkedin' ORDER BY p.fetched_at DESC, p.id DESC LIMIT 100`)).map((r: any) => ({
    id: Number(r.id), url: r.url, text: r.caption ?? "", type: r.post_type, reactions: r.likes === null ? null : Number(r.likes), comments: r.comments === null ? null : Number(r.comments),
    reposts: r.shares === null ? null : Number(r.shares), postedAt: r.posted_at ? String(r.posted_at) : null, handle: r.handle, name: r.display_name, why: r.why_i_follow, breakdown: r.breakdown ?? null,
  })) : [];
  const liConn = tab === "linkedin" && liView === "posts" ? await getLinkedInConnection() : null;
  const liAccount: AccountState = {
    configured: linkedinConfigured(), cap: dailyCap(),
    connected: liConn ? { name: liConn.display_name ?? "your LinkedIn profile", expiresAt: liConn.expires_at, usable: tokenUsable(liConn.expires_at) && !!liConn.access_token_enc, lastError: liConn.last_error } : null,
    status: sp.linkedin ? { kind: sp.linkedin, name: sp.name?.slice(0, 120), reason: sp.reason?.slice(0, 240) } : null,
  };
  const linkedin: LinkedInRow[] = tab === "linkedin" && liView === "posts" ? (await query<any>(
    `SELECT i.id, i.idea, i.script, i.status, i.scheduled_for::text AS day, left(i.scheduled_time::text, 5) AS time,
            EXISTS (SELECT 1 FROM tasks t WHERE t.id = i.reminder_task_id AND t.done_at IS NULL) AS reminder,
            (SELECT count(*) FROM post_images m WHERE m.content_item_id = i.id) AS images,
            EXISTS (SELECT 1 FROM post_images m WHERE m.content_item_id = i.id AND m.selected) AS chosen
       FROM content_items i WHERE i.format = $1 AND i.status <> 'Archived' ORDER BY i.created_at DESC, i.id DESC`, [LINKEDIN_FORMAT])).map((r: any) => ({
    id: Number(r.id), title: r.idea, opening: openingLine(r.script ?? ""), words: wordCount(r.script ?? ""), day: r.day, time: r.time, reminder: r.reminder === true, images: Number(r.images), hasImage: r.chosen === true,
    stage: postStage({ status: r.status, day: r.day, hasImage: r.chosen === true }),
  })) : [];
  const niche = pickNiche(sp.niche, config.niches);
  const live = rows.filter((r: any) => r.status !== "Archived");
  const counts: Record<string, number> = { all: live.length, untagged: inNiche(live, "untagged").length, ...Object.fromEntries(config.niches.map((n) => [n, inNiche(live, n).length])) };
  const items = inNiche(rows, niche).map((r: any) => ({ ...r, scoreLines: posts.filter((p) => p.content_item_id === Number(r.id)).map((p) => scoreLabel(p.platform, p.performance)) }));
  const open = items.filter((i: any) => i.status === "Idea").length;
  const gate = backlogState(open, config.max_open_ideas, override);

  return (
    <>
      <PageHeader
        title="Content dashboard"
        description="Plan, film, script and measure video content across your niches. One place for your ideas, projects, calendar and analytics."
        actions={
          <span className="row" style={{ gap: 8 }}>
            <Link href="/content/repurpose" className="btn secondary"><Repeat2 size={15} aria-hidden /> Repurpose</Link>
            <Link href="/content/film" className="btn"><Clapperboard size={15} aria-hidden /> Filming day</Link>
          </span>
        }
      />
      <NeedsYouCard href="/content" />
      <ContentTabs current={tab} boardCount={open} projectCount={live.length} />

      {tab === "overview" && (
        <div className="stack">
          <section className="stats">
            <Stat label="Weekly target" value={`${config.posts_per_week} posts`} hint={`${ins.totalPosts} total published on record`} />
            <Stat label="Open ideas" value={open} hint={`${live.length} total active in pipeline`} />
            <Stat label="Top performer" value={ins.top[0] ? `${ins.top[0].multiple.toFixed(1)}×` : "–"} hint={ins.top[0] ? ins.top[0].hookUsed || ins.top[0].idea : "Needs 3 posts per group"} />
          </section>

          <div className="split">
            <div className="stack">
              <section className="card">
                <div className="row-between">
                  <h2 style={{ margin: 0 }}>Next 5 to film</h2>
                  <Link href="/content/film" className="btn secondary">Open prompter</Link>
                </div>
                <p className="muted" style={{ margin: "6px 0 12px" }}>Top ranked ideas ready for your next filming session.</p>
                {ins.next.length === 0 ? <p className="muted">No open ideas waiting. Generate some on the Board tab.</p> : (
                  <ol className="fx-list" style={{ listStyle: "decimal", paddingLeft: 20 }}>
                    {ins.next.map((item) => (
                      <li key={item.id} style={{ display: "list-item", padding: "6px 0", borderBottom: "1px solid var(--line-soft)" }}>
                        <Link href={`/content/${item.id}`} style={{ fontWeight: 600 }}>{item.idea}</Link>
                        <div className="muted">{item.reasons.join(" · ")}</div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className="card">
                <div className="row-between">
                  <h2 style={{ margin: 0 }}>Weekly brief</h2>
                  <Link href="/content/brief" className="muted">View full brief →</Link>
                </div>
                {latestBrief ? (
                  <div className="stack" style={{ gap: 8, marginTop: 10 }}>
                    <p style={{ fontWeight: 600, margin: 0 }}>{latestBrief.prose?.headline}</p>
                    <p className="muted" style={{ margin: 0 }}>Week of {new Date(latestBrief.week_start + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                    <ul className="fx-bullets" style={{ margin: "4px 0 0" }}>
                      {(latestBrief.prose?.what_to_do ?? []).slice(0, 3).map((line: string, i: number) => <li key={i}>{line}</li>)}
                    </ul>
                  </div>
                ) : (
                  <p className="muted" style={{ marginTop: 8 }}>No brief generated yet. <Link href="/content/brief">Write this week's brief</Link>.</p>
                )}
              </section>
            </div>

            <div className="stack">
              <QuickCaptureBox style={{ marginBottom: 12 }} />

              <section className="card">
                <h2>Quick actions</h2>
                <div className="stack" style={{ gap: 10 }}>
                  <Link href="/content?tab=board" className="row-between card" style={{ padding: 12, textDecoration: "none" }}>
                    <span><b>Open content board</b><br /><span className="muted">{open} ideas waiting to be scripted</span></span>
                    <span>→</span>
                  </Link>
                  <Link href="/content/calendar" className="row-between card" style={{ padding: 12, textDecoration: "none" }}>
                    <span><b>Publishing calendar</b><br /><span className="muted">Schedule slots for this week</span></span>
                    <span>→</span>
                  </Link>
                  <Link href="/content/insights" className="row-between card" style={{ padding: 12, textDecoration: "none" }}>
                    <span><b>Analytics &amp; insights</b><br /><span className="muted">What's working: formats, pillars, hooks</span></span>
                    <span>→</span>
                  </Link>
                  <Link href="/content?tab=followers" className="row-between card" style={{ padding: 12, textDecoration: "none" }}>
                    <span><b>Follower tracking</b><br /><span className="muted">Live audience growth &amp; pace across channels</span></span>
                    <span>→</span>
                  </Link>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {tab === "board" && (
        <ContentBoard
          initial={items}
          platforms={config.platforms}
          niches={config.niches}
          currentStage={currentStage}
          niche={niche}
          override={override}
          nicheCounts={counts}
          openItem={Number(sp.open) || null}
          openNumbers={sp.post && sp.bucket ? { post: Number(sp.post), bucket: Number(sp.bucket) } : null}
          generator={
            (currentStage === "all" || currentStage === "Idea") ? (
              <details className="card" style={{ marginBottom: 16 }}>
                <summary>Generate 10 video ideas{gate.blocked && <span className="muted"> · paused, {open} waiting</span>}</summary>
                <p className="muted" style={{ marginTop: 12 }}>Ideas are built from your best posts, the outliers you broke down, trends you noted and patterns across the businesses you researched, spread across your weekly mix. Each is scored; anything under 5 is set aside. Your niches are set in <code>content:</code> in config/niches.yaml ({audienceText(config)}).</p>
                {gate.blocked ? (
                  <p role="status" style={{ marginTop: 8 }}>
                    {gate.message} <Link href="/content?tab=board&more=1">Generate anyway</Link>
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
            ) : null
          }
        />
      )}

      {tab === "projects" && (
        <div className="stack" style={{ gap: 16 }}>
          <QuickCaptureBox />

          <div className="card table-wrap">
            <div className="row-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>Active projects</h2>
              <span className="muted">{live.length} projects</span>
            </div>
            {live.length === 0 ? (
              <EmptyState title="No active projects" icon={<Video size={22} />}>Capture a quick note above or generate ideas on the Board tab to begin a project.</EmptyState>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Project / Idea</th>
                    <th>Niche</th>
                    <th>Pillar &amp; format</th>
                    <th>Progress</th>
                    <th>Status</th>
                    <th>Scheduled</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {live.map((item: any) => {
                    const prog = calculateChecklistProgress(item.checklist);
                    return (
                      <tr key={item.id}>
                        <td>
                          <Link href={`/content/${item.id}`} style={{ fontWeight: 600 }}>{item.idea}</Link>
                          {item.summary && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{item.summary}</div>}
                        </td>
                        <td>{item.niche ? <Badge value={item.niche} /> : <span className="muted">–</span>}</td>
                        <td className="muted">{item.pillar || item.format || "–"}</td>
                        <td style={{ minWidth: 110 }}>
                          <span className="row" style={{ gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{prog.done}/{prog.total}</span>
                            <span style={{ flex: 1, maxWidth: 50, height: 5, backgroundColor: "var(--line-soft)", borderRadius: 3, overflow: "hidden", display: "inline-block" }}>
                              <span style={{ display: "block", height: "100%", width: `${prog.percent}%`, backgroundColor: prog.percent === 100 ? "var(--good)" : "var(--accent)" }} />
                            </span>
                          </span>
                        </td>
                        <td><Badge value={item.status} /></td>
                        <td className="muted">{item.day || "Unscheduled"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <Link
                            href={`/content/${item.id}`}
                            className="secondary"
                            style={{ fontSize: 12, padding: "4px 10px", display: "inline-block" }}
                          >
                            {item.script ? "Rewrite / Polish" : "Write script"}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === "linkedin" && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="pills" role="group" aria-label="LinkedIn views">
            {([["posts", "Posts"], ["working", "What's working"], ["swipe", "Swipe file"]] as const).map(([k, label]) => (
              <Link key={k} href={k === "posts" ? "/content?tab=linkedin" : `/content?tab=linkedin&view=${k}`} className={`pill${liView === k ? " on" : ""}`} aria-current={liView === k ? "page" : undefined}>{label}</Link>
            ))}
          </div>
          {liView === "posts" && <LinkedInAccountCard a={liAccount} />}
          {liView === "posts" && (
            <LinkedInPanel
              posts={linkedin}
              sources={live.filter((l: any) => l.format !== LINKEDIN_FORMAT).slice(0, 80).map((l: any) => ({ id: Number(l.id), idea: l.idea }))}
              aiReady={!!process.env.ANTHROPIC_API_KEY}
            />
          )}
          {liView === "working" && liInsights && <LinkedInInsights data={liInsights} />}
          {liView === "swipe" && <LinkedInSwipe rows={swipes} aiReady={!!process.env.ANTHROPIC_API_KEY} />}
        </div>
      )}

      {tab === "followers" && (
        <FollowerTracker summaries={followers} />
      )}

      {tab === "footage" && (
        <FootageManager
          clips={clips}
          renames={renames}
          projects={live.map((l: any) => ({ id: Number(l.id), idea: l.idea }))}
          lastFolder={clips[0]?.folder_path}
        />
      )}

      {tab === "thumbnails" && (
        <ThumbnailBuilder
          thumbnails={thumbnails}
          projects={live.map((l: any) => ({ id: Number(l.id), idea: l.idea }))}
          clips={clips}
          assets={coverAssets}
        />
      )}
    </>
  );
}
