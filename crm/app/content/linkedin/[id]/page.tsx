import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { LINKEDIN_FORMAT, postProblem, postStage } from "@/lib/linkedinMath";
import { plannedLabel, shortTime } from "@/lib/linkedinScheduleMath";
import { loadLinkedInSlots } from "@/lib/linkedinSchedule";
import { getLinkedInConnection } from "@/lib/linkedinApi";
import { linkedinConfigured, tokenUsable } from "@/lib/linkedinApiMath";
import ContentTabs from "@/components/ContentTabs";
import LinkedInPostEditor from "@/components/LinkedInPostEditor";
import PostImageBuilder from "@/components/PostImageBuilder";
import LinkedInSchedule from "@/components/LinkedInSchedule";
import { Badge, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "LinkedIn post" };

export default async function LinkedInPost({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [[post], images, slots, [calendar], linkedinConn] = await Promise.all([
    query<any>(
      `SELECT i.id, i.idea, i.hook, i.hook_alt, i.script, i.status, i.niche, i.source_ref, i.posted_at, i.scheduled_for::text AS day, i.scheduled_time::text AS time,
              (t.id IS NOT NULL AND t.done_at IS NULL) AS reminder_open
         FROM content_items i LEFT JOIN tasks t ON t.id = i.reminder_task_id WHERE i.id = $1 AND i.format = $2`, [id, LINKEDIN_FORMAT]),
    query<any>(`SELECT id, design, selected FROM post_images WHERE content_item_id = $1 ORDER BY selected DESC, id DESC`, [id]),
    loadLinkedInSlots(id),
    query<any>(`SELECT 1 FROM calendar_connections WHERE refresh_token_enc IS NOT NULL LIMIT 1`).catch(() => []),
    getLinkedInConnection(),
  ]);
  if (!post) notFound();
  const text: string = post.script ?? "";
  const stage = postStage({ status: post.status, day: post.day, hasImage: images.some((i: any) => i.selected) });
  const from = String(post.source_ref ?? "").match(/^(?:linkedin:)?content:(\d+)$/)?.[1];
  const aiReady = !!process.env.ANTHROPIC_API_KEY;

  return (
    <>
      <PageHeader
        back={{ href: "/content?tab=linkedin", label: "LinkedIn posts" }}
        title={post.idea}
        description={
          <span className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <Badge value={stage} />
            {post.niche && <Badge value={post.niche} />}
            {post.day && post.status !== "Posted" && <span>Planned for {plannedLabel(post.day, shortTime(post.time))}</span>}
            {from && <Link href={`/content/${from}`}>From video #{from}</Link>}
          </span>
        }
      />
      <ContentTabs current="linkedin" />

      <div className="li-page">
        <div className="stack">
          {/* A new key when the saved words change (a save or an AI rewrite), so the editor starts again from what is saved. */}
          <LinkedInPostEditor
            key={`${post.id}:${post.idea}:${text}`}
            post={{ id, title: post.idea, text, opening: post.hook, openingAlt: post.hook_alt, posted: post.status === "Posted" }}
            aiReady={aiReady}
          />
          <LinkedInSchedule
            key={`${post.day}:${post.time}:${post.reminder_open}:${post.status}`}
            post={{
              id, title: post.idea, text, problem: text.trim() ? postProblem(post.idea, text) : null, hook: post.hook, hookAlt: post.hook_alt,
              day: post.day, time: shortTime(post.time), reminderOpen: post.reminder_open === true, posted: post.status === "Posted", postedAt: post.posted_at ? String(post.posted_at) : null,
            }}
            slots={slots}
            image={images.find((i: any) => i.selected)?.design ?? null}
            footer={process.env.BUSINESS_NAME?.trim() ?? ""}
            calendarConnected={!!calendar}
            account={{
              configured: linkedinConfigured(),
              connected: linkedinConn ? { sub: linkedinConn.person_sub, name: linkedinConn.display_name ?? "your LinkedIn profile", usable: tokenUsable(linkedinConn.expires_at) && !!linkedinConn.access_token_enc } : null,
            }}
          />
        </div>

        <PostImageBuilder
          postId={id}
          hasText={text.trim() !== ""}
          images={images.map((i: any) => ({ id: Number(i.id), design: i.design, selected: i.selected === true }))}
          footer={process.env.BUSINESS_NAME?.trim() ?? ""}
          aiReady={aiReady}
        />
      </div>
    </>
  );
}
