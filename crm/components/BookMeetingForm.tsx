"use client";

import { useActionState, useMemo, useState } from "react";
import { bookMeeting } from "@/lib/meetingActions";
import type { BookableContact } from "@/lib/meetings";

// One meeting, one click, one confirmation that names the person and the calendar. Nothing is sent until the owner confirms.
export default function BookMeetingForm({ contacts, calendarEmail, preselect, defaultDate, left }: {
  contacts: BookableContact[]; calendarEmail: string; preselect: number | null; defaultDate: string; left: number;
}) {
  const [error, action, pending] = useActionState(bookMeeting, null);
  const [contactId, setContactId] = useState<number | "">(preselect ?? "");
  const [title, setTitle] = useState<string | null>(null);   // null = follow the default until the owner types
  const chosen = contacts.find((c) => c.id === contactId);
  const autoTitle = chosen ? `Call with ${chosen.company ?? chosen.name}` : "";
  const groups = useMemo(() => {
    const m = new Map<string, BookableContact[]>();
    for (const c of contacts) { const k = c.company ?? "No company"; m.set(k, [...(m.get(k) ?? []), c]); }
    return [...m.entries()];
  }, [contacts]);

  const confirmText = (f: FormData) => {
    const when = new Date(`${f.get("date")}T${f.get("time")}`);
    const day = isNaN(when.getTime()) ? "" : when.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    return `Send ${chosen?.name ?? "this person"} (${chosen?.email ?? ""}) a Google Calendar invitation with a Meet link?\n\nWhen: ${day} at ${f.get("time")} (UK time), ${f.get("length")} minutes\nFrom calendar: ${calendarEmail}\n\nGoogle emails the invitation as soon as you press OK.`;
  };

  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm(confirmText(new FormData(e.currentTarget)))) e.preventDefault(); }} className="card stack" style={{ gap: 14, maxWidth: 760 }}>
      <label className="stack" style={{ gap: 4 }}><span className="field-label">Who is the meeting with?</span>
        <select name="contact_id" required value={contactId} onChange={(e) => setContactId(e.target.value ? Number(e.target.value) : "")} style={{ width: "100%" }}>
          <option value="">Choose a saved contact…</option>
          {groups.map(([company, list]) => (
            <optgroup key={company} label={company}>
              {list.map((c) => <option key={c.id} value={c.id}>{c.name}{c.role ? `, ${c.role}` : ""}</option>)}
            </optgroup>
          ))}
        </select>
        {contacts.length === 0 && <span className="muted">No one yet. Only saved contacts with an email address can be invited: add one on a company page first.</span>}
        {chosen && <span className="muted">The invitation goes to {chosen.email}</span>}
      </label>
      <label className="stack" style={{ gap: 4 }}><span className="field-label">Title (what they will see)</span>
        <input name="title" required maxLength={120} value={title ?? autoTitle} onChange={(e) => setTitle(e.target.value)} placeholder="Call with Oakley Dental" style={{ width: "100%" }} />
      </label>
      <div className="row" style={{ alignItems: "flex-end", gap: 12 }}>
        <label className="stack" style={{ gap: 4 }}><span className="field-label">Date</span><input name="date" type="date" required defaultValue={defaultDate} /></label>
        <label className="stack" style={{ gap: 4 }}><span className="field-label">Start (UK time)</span><input name="time" type="time" required step={900} defaultValue="10:00" /></label>
        <label className="stack" style={{ gap: 4 }}><span className="field-label">Length</span>
          <select name="length" defaultValue="30">{[15, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n} minutes</option>)}</select></label>
      </div>
      <label className="stack" style={{ gap: 4 }}><span className="field-label">Note in the invitation (optional)</span>
        <textarea name="notes" rows={3} maxLength={1000} placeholder="What the call is for, in a sentence or two. Business topics only." />
      </label>
      <div className="stack" style={{ gap: 8 }}>
        <label className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}><input type="checkbox" name="agreed" required style={{ marginTop: 3 }} /><span>They have agreed to a call (they replied, booked, filled in a form or asked). The CRM does not invite people cold.</span></label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" name="move_deal" defaultChecked /><span className="muted">If they have an early-stage deal, move it to Call booked</span></label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" name="allow_clash" /><span className="muted">Book it even if it clashes with something on my calendar</span></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button disabled={pending || contacts.length === 0}>{pending ? "Booking…" : "Book and send invitation"}</button>
        <span className="muted">Google sends one email with the Meet link. {left} left today.</span>
      </div>
    </form>
  );
}
