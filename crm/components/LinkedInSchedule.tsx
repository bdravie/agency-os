"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CalendarClock, CheckCircle2, Circle, Copy, Download, ExternalLink, Rocket, Send } from "lucide-react";
import { useToast } from "./Toast";
import PostedDialog from "./PostedDialog";
import { schedulePostAction } from "@/lib/linkedinActions";
import { openingLine, cleanPostImage, imageFileName } from "@/lib/linkedinMath";
import { plannedLabel, readiness, type Slot } from "@/lib/linkedinScheduleMath";
import { blobForLinkedIn, downloadForLinkedIn } from "@/lib/linkedinDraw";
import { publishLinkedInAction } from "@/lib/linkedinPublishActions";
import { cleanMermaidError } from "@/lib/flowchartMath";

/** The connected LinkedIn profile for click-to-post, or why there is none. `usable` is false once the 60-day access has run out. */
export type LinkedInAccount = { configured: boolean; connected: { sub: string; name: string; usable: boolean } | null };

export type SchedulePost = {
  id: number; title: string; text: string; problem: string | null; hook: string | null; hookAlt: string | null;
  day: string | null; time: string | null; reminderOpen: boolean; posted: boolean; postedAt: string | null;
};

/** Plan a LinkedIn post (day, time, reminder in your calendar), see what is left to do, then post it by hand and record it. The app never posts. */
export default function LinkedInSchedule({ post, slots, image, footer, calendarConnected, account }: {
  post: SchedulePost; slots: Slot[]; image: unknown | null; footer: string; calendarConnected: boolean; account: LinkedInAccount;
}) {
  const toast = useToast();
  const router = useRouter();
  const [date, setDate] = useState(post.day ?? "");
  const [time, setTime] = useState(post.time ?? "");
  const [remind, setRemind] = useState(post.day ? post.reminderOpen : true);
  const [busy, setBusy] = useState(false);
  const [posting, setPosting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<string | null>(null);
  const dirty = date !== (post.day ?? "") || time !== (post.time ?? "") || (!!date && remind !== post.reminderOpen);
  const checks = readiness({ text: post.text, problem: post.problem, hasImage: image !== null, date: post.day, reminder: post.reminderOpen, posted: post.posted });

  const save = async (next?: { date: string; time: string }) => {
    const d = next?.date ?? date, t = next?.time ?? time;
    setBusy(true);
    try {
      const r = await schedulePostAction({ id: post.id, date: d, time: t, remind });
      if (r.error) { toast(r.error, "bad"); return; }
      toast(!d ? "Plan cleared" : remind ? `Planned for ${plannedLabel(d, t || null)}, with a reminder` : `Planned for ${plannedLabel(d, t || null)}`);
      router.refresh();
    } catch (err) { toast(`Could not save the plan: ${err instanceof Error ? err.message : String(err)}`, "bad"); }
    finally { setBusy(false); }
  };
  const pick = (s: Slot) => { setDate(s.date); setTime(s.time); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(post.text.trim()); toast("Post copied: paste it into LinkedIn"); }
    catch { toast("The browser would not copy it. Select the text and copy it by hand.", "bad"); }
  };
  const download = async () => {
    const d = cleanPostImage(image);
    try { await downloadForLinkedIn(d, footer, imageFileName(d.title, d.kind, d.size)); }
    catch (err) { toast(`The image could not be made: ${cleanMermaidError(err)}`, "bad"); }
  };
  // Click-to-post: one post, now, to the connected profile, after a confirmation that names it. The image or carousel is drawn here exactly as the download.
  const publish = async () => {
    const who = account.connected;
    if (!who) return;
    const kind = image === null ? null : cleanPostImage(image).kind === "carousel" ? "the carousel (as a PDF document)" : "the chosen image";
    if (!window.confirm(`Post this to LinkedIn now, publicly, as ${who.name}?\n\nIt goes out straight away${kind ? ` with ${kind}` : " as text only"}, using the saved text. It can only be edited or deleted on LinkedIn afterwards.`)) return;
    setPublishing(true);
    try {
      const fd = new FormData();
      fd.set("id", String(post.id)); fd.set("profile", who.sub);
      if (image !== null) {
        const d = cleanPostImage(image);
        fd.set("media", new File([await blobForLinkedIn(d, footer)], imageFileName(d.title, d.kind, d.size), { type: d.kind === "carousel" ? "application/pdf" : "image/png" }));
      }
      const r = await publishLinkedInAction(fd);
      if (!r.ok) { toast(r.error, "bad"); return; }
      setPublished(r.url); toast(r.message, r.recorded ? undefined : "bad"); router.refresh();
    } catch (err) { toast(`Nothing was posted: ${err instanceof Error ? err.message : String(err)}`, "bad"); }
    finally { setPublishing(false); }
  };

  // Which opening line is in the saved text, so the Posted dialog records the right one for the A/B comparison.
  const first = openingLine(post.text);
  const pair = post.hook && post.hookAlt && [post.hook.trim(), post.hookAlt.trim()].includes(first);

  return (
    <section className="card stack" style={{ gap: 14 }} id="plan">
      <div className="row" style={{ gap: 8 }}><CalendarClock size={18} aria-hidden /><h2 style={{ margin: 0 }}>Plan and post</h2></div>

      {post.posted ? (
        <p style={{ margin: 0 }}>
          Posted{post.postedAt ? ` on ${new Date(post.postedAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}` : ""}.{" "}
          <Link href={`/content?open=${post.id}`}>Add its link or numbers on the Board</Link>.
        </p>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            Nothing is posted from here. Pick a day and time, and the reminder goes into {calendarConnected ? "your Google Calendar (no guests, nothing emailed) within a minute" : "Tasks"}. Moving it there moves the plan here.
          </p>

          {slots.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="field-label">Suggested slots</span>
              <div className="pills" role="group" aria-label="Suggested slots">
                {slots.map((s) => {
                  const on = date === s.date && time === s.time;
                  return (
                    <button key={`${s.date}${s.time}`} type="button" className={`pill${on ? " on" : ""}`} aria-pressed={on} title={s.why} onClick={() => pick(s)} disabled={busy}>
                      {plannedLabel(s.date, s.time)}{s.taken ? ` · ${s.taken} planned` : ""}
                    </button>
                  );
                })}
              </div>
              <span className="muted" style={{ fontSize: 13 }}>{slots[0].why.charAt(0).toUpperCase() + slots[0].why.slice(1)}.</span>
            </div>
          )}

          <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="stack" style={{ gap: 4 }}>
              <span className="field-label">Day</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={busy} style={{ width: "auto" }} />
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span className="field-label">Time (optional)</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={busy || !date} step={900} style={{ width: "auto" }} />
            </label>
            <label className="row" style={{ gap: 6, alignItems: "center", paddingBottom: 10 }}>
              <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} disabled={busy} style={{ width: "auto" }} />
              <BellRing size={14} aria-hidden /> Remind me
            </label>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="secondary" onClick={() => save()} disabled={busy || !dirty || (!date && !post.day)}>{busy ? "Saving…" : post.day ? "Save the plan" : "Plan it"}</button>
            {post.day && <button type="button" className="link" onClick={() => { setDate(""); setTime(""); save({ date: "", time: "" }); }} disabled={busy}>Clear the plan</button>}
          </div>
        </>
      )}

      <ul className="li-checks" aria-label="Before you post">
        {checks.map((c) => (
          <li key={c.label} className={c.done ? "done" : ""}>
            {c.done ? <CheckCircle2 size={16} aria-hidden /> : <Circle size={16} aria-hidden />}
            <span>{c.label}{!c.done && c.hint && <span className="muted"> · {c.hint}</span>}</span>
          </li>
        ))}
      </ul>

      {!post.posted && (
        <div className="row" style={{ gap: 8, flexWrap: "wrap", paddingTop: 10, borderTop: "1px solid var(--line-soft)" }}>
          <button type="button" className="secondary" onClick={copy} disabled={!post.text.trim()}><Copy size={15} aria-hidden /> Copy text</button>
          <button type="button" className="secondary" onClick={download} disabled={image === null} title={image === null ? "Choose an image first" : undefined}><Download size={15} aria-hidden /> {image !== null && cleanPostImage(image).kind === "carousel" ? "Download carousel PDF" : "Download image"}</button>
          <a className="btn secondary" href="https://www.linkedin.com/feed/" target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden /> Open LinkedIn</a>
          <button type="button" className="secondary" onClick={() => setPosting(true)} disabled={!post.text.trim() || publishing}><Send size={15} aria-hidden /> I've posted it</button>
        </div>
      )}
      {!post.posted && account.configured && (
        <div className="li-publish">
          {account.connected?.usable ? (
            <>
              <button type="button" className="secondary" onClick={publish} disabled={publishing || !post.text.trim() || !!post.problem}>
                <Rocket size={15} aria-hidden /> {publishing ? "Posting… (up to 30 seconds)" : "Post to LinkedIn now"}
              </button>
              <span className="muted" style={{ fontSize: 13 }}>As {account.connected.name}, after you confirm. One post, straight away, never on a timer.</span>
            </>
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>
              {account.connected ? "Your LinkedIn connection has expired (it lasts about 60 days)." : "Connect LinkedIn to post from here."}{" "}
              <a href="/api/linkedin/connect">{account.connected ? "Connect again" : "Connect LinkedIn"}</a>
            </span>
          )}
        </div>
      )}
      {published && <p style={{ margin: 0 }}><a href={published} target="_blank" rel="noopener noreferrer">Open the post on LinkedIn</a></p>}
      {!post.posted && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Copy text uses the saved version: save your edits first.</p>}

      {posting && (
        <PostedDialog
          itemId={post.id} idea={post.title}
          hook={pair ? post.hook : first || post.hook} hookAlt={pair ? post.hookAlt : null}
          used={pair ? { linkedin: first === post.hookAlt?.trim() ? "B" : "A" } : undefined}
          platforms={["linkedin"]}
          onClose={() => setPosting(false)}
          onDone={() => { setPosting(false); router.refresh(); }}
        />
      )}
    </section>
  );
}
