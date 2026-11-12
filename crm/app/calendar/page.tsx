import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { loadMeetings, loadMonthView, loadWeekView, type MonthView } from "@/lib/meetings";
import { addDays, addMonths, dayKey, mondayOf } from "@/lib/meetingMath";
import { googleConfigured, getConnection } from "@/lib/gcalAuth";
import { disconnectCalendar } from "@/lib/meetingActions";
import { redirectUri } from "@/lib/gmail";
import { runSync } from "@/lib/calendarSync";
import SyncNowButton from "@/components/SyncNowButton";
import { ago } from "@/lib/format";
import ConfirmButton from "@/components/ConfirmButton";
import MeetingList from "@/components/MeetingList";
import WeekCalendar from "@/components/WeekCalendar";
import MonthCalendar from "@/components/MonthCalendar";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string; view?: string; month?: string; connected?: string; booked?: string; cancelled?: string; error?: string }> }) {
  const sp = await searchParams;
  const today = dayKey(new Date());
  const anchor = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today;
  const monday = mondayOf(anchor);
  // Month view: ?view=month, with ?month=YYYY-MM to move about. Anything else is the week.
  const monthly = sp.view === "month";
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const load = () => (monthly ? loadMonthView(`${month}-01`) : loadWeekView(anchor));
  const [first0, meetings, conn] = await Promise.all([load(), loadMeetings(), getConnection()]);
  let view = first0;
  // The very first time, fetch the calendar now so the page is not empty.
  if (conn && !view.lastSync && !view.error) { await runSync({ force: true }); view = await load(); }
  const configured = googleConfigured();
  const first = new Date(monday + "T12:00:00Z"), last = new Date(addDays(monday, 6) + "T12:00:00Z");
  const range = `${first.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} to ${last.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
  const errorText = sp.error === "not-configured" ? "Google is not set up yet (see the steps below)." : sp.error === "state" ? "That sign-in could not be checked. Please try connecting again." : sp.error ?? null;
  const week = (d: string) => `/calendar?week=${d}`;
  const monthHref = (m: string) => `/calendar?view=month&month=${m}`;
  const monthTitle = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const prev = monthly ? monthHref(addMonths(month, -1)) : week(addDays(monday, -7));
  const next = monthly ? monthHref(addMonths(month, 1)) : week(addDays(monday, 7));
  const span = monthly ? "month" : "week";

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Your Google Calendar, the meetings you book from here, tasks due and content scheduled. Booking sends the person a Google Meet invitation, only when you click."
        actions={conn ? <Link href="/calendar/book" className="btn"><Plus size={16} aria-hidden /> Book a meeting</Link> : undefined}
      />
      {sp.connected && <p className="card" role="status" style={{ marginBottom: 14 }}>Connected {sp.connected}. Your calendar is below.</p>}
      {sp.booked && <p className="card" role="status" style={{ marginBottom: 14 }}>Meeting booked. Google has emailed the invitation with the Meet link.</p>}
      {sp.cancelled && <p className="card" role="status" style={{ marginBottom: 14 }}>Meeting cancelled. Google has told them.</p>}
      {errorText && <p className="card error" role="alert" style={{ marginBottom: 14 }}>{errorText}</p>}

      {!conn ? (
        <div className="stack">
          <div className="card"><EmptyState title="Connect your Google Calendar" icon={<CalendarDays size={22} />}>
            Connect the Google Workspace account whose calendar you want to use. The CRM can then show your week and book meetings with a Meet link.
            {configured && <p style={{ marginTop: 12 }}><a className="btn" href="/api/google/calendar/connect">Connect Google Calendar</a></p>}
          </EmptyState></div>
          <div className="card stack" style={{ gap: 8 }}>
            <h2>One-off setup in Google (about 5 minutes)</h2>
            <ol style={{ margin: 0, paddingLeft: 20 }} className="stack">
              <li>Open <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">the Google Calendar API page</a> in the same Google Cloud project you used for the mailboxes, and press <b>Enable</b>.</li>
              <li>In that project open <b>Google Auth Platform</b> (or <b>OAuth consent screen</b>), then <b>Data access</b>, press <b>Add or remove scopes</b>, and add <code>https://www.googleapis.com/auth/calendar.events</code>. Save.</li>
              <li>If the consent screen is set to <b>External</b> and in Testing, make sure your own Google address is listed as a test user. (Workspace accounts can set it to <b>Internal</b>, which needs no review.)</li>
              <li>Come back here and press <b>Connect Google Calendar</b>. Tick every box on Google's screen.</li>
            </ol>
            {!configured && <p className="error">GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set in the env file yet. They are the same ones the mailboxes use (see the Mailboxes page for the steps), then restart the CRM.</p>}
            <p className="muted">The sign-in address Google expects is <code>{redirectUri()}</code> (already registered if the mailboxes work).</p>
          </div>
        </div>
      ) : (
        <div className="stack">
          <section className="card" aria-labelledby="week-h">
            <div className="row-between">
              <h2 id="week-h" style={{ margin: 0 }}>{monthly ? monthTitle : range}</h2>
              <div className="row" style={{ gap: 8 }}>
                <nav className="row" style={{ gap: 6 }} aria-label="Calendar view">
                  <Link href={week(monthly && month !== today.slice(0, 7) ? `${month}-01` : anchor)} className={`pill${monthly ? "" : " on"}`} aria-current={monthly ? undefined : "page"}>Week</Link>
                  <Link href={monthHref(monthly ? month : monday.slice(0, 7))} className={`pill${monthly ? " on" : ""}`} aria-current={monthly ? "page" : undefined}>Month</Link>
                </nav>
                <Link href={prev} className="btn secondary" aria-label={`Previous ${span}`}><ChevronLeft size={16} aria-hidden /></Link>
                <Link href={monthly ? "/calendar?view=month" : "/calendar"} className="btn secondary">Today</Link>
                <Link href={next} className="btn secondary" aria-label={`Next ${span}`}><ChevronRight size={16} aria-hidden /></Link>
              </div>
            </div>
            {view.error && <p className="error" role="alert" style={{ marginTop: 10 }}>{view.error} <a href="/api/google/calendar/connect">Connect again</a></p>}
            <div style={{ marginTop: 14 }}>{monthly ? <MonthCalendar view={view as MonthView} max={4} /> : <WeekCalendar view={view} max={8} />}</div>
            <div className="row-between" style={{ marginTop: 12 }}>
              <p className="muted" style={{ margin: 0 }}>
                Synced with {view.calendarEmail} {view.lastSync ? ago(view.lastSync) : "just now"}, and again about every minute while the CRM is open. Private events show as Busy.
                Tasks with a due date appear in your Google Calendar too: change one in either place and the other follows, or delete its event in Google to stop syncing that task.
              </p>
              <SyncNowButton />
            </div>
          </section>

          <div className="grid">
            <section className="card" aria-labelledby="up-h"><h2 id="up-h">Booked from the CRM: upcoming</h2>
              <MeetingList rows={meetings.upcoming} empty="Nothing booked yet. Use Book a meeting, or the link on a company page." /></section>
            <section className="card" aria-labelledby="past-h"><h2 id="past-h">Past and cancelled</h2>
              <MeetingList rows={meetings.past} empty="Nothing yet." cancellable={false} /></section>
          </div>

          <section className="card row-between" aria-label="Calendar connection">
            <span className="muted">Connected to {conn.email}.{conn.last_error ? <span className="error"> {conn.last_error}</span> : null}</span>
            <form action={disconnectCalendar}><ConfirmButton className="secondary" message="Disconnect the calendar? Meetings already booked stay as they are.">Disconnect</ConfirmButton></form>
          </section>
        </div>
      )}
    </>
  );
}
