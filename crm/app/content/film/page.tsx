import { query } from "@/lib/db";
import { parseScript } from "@/lib/filmMath";
import Teleprompter, { type FilmItem } from "@/components/Teleprompter";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Filming day" };

export default async function Film() {
  const rows = await query<any>(
    `SELECT id, idea, hook, hook_alt, script, caption, keyword FROM content_items WHERE status = 'Scripted' AND script IS NOT NULL AND format NOT IN ('Reels caption','TikTok caption','Shorts caption','LinkedIn post','Upwork portfolio blurb')
      ORDER BY scheduled_for NULLS LAST, id`);
  const items: FilmItem[] = rows.map((r: any) => ({ id: Number(r.id), idea: r.idea, hook: r.hook, hookAlt: r.hook_alt, caption: r.caption, keyword: r.keyword, parsed: parseScript(r.script) }));
  return (
    <>
      <PageHeader back={{ href: "/content", label: "Content" }} title="Filming day" description="Your scripted videos, one after another. Read from the screen, then mark each one filmed." />
      <Teleprompter items={items} />
    </>
  );
}
