import Link from "next/link";
import { Video, ExternalLink } from "lucide-react";
import ConfirmButton from "@/components/ConfirmButton";
import { cancelMeeting } from "@/lib/meetingActions";
import { dayLabel, timeLabel } from "@/lib/meetingMath";
import type { MeetingRow } from "@/lib/meetings";

export default function MeetingList({ rows, empty, cancellable = true, showCompany = true }: { rows: MeetingRow[]; empty: string; cancellable?: boolean; showCompany?: boolean }) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul>{rows.map((m) => (
      <li key={m.id} className="row-between" style={{ alignItems: "flex-start" }}>
        <div>
          <b>{m.title}</b>
          <div className="muted">{dayLabel(new Date(m.starts_at))}, {timeLabel(new Date(m.starts_at))} to {timeLabel(new Date(m.ends_at))}
            {m.contact_name && <> · {m.contact_name}</>}
            {showCompany && m.company_id && <> · <Link href={`/companies/${m.company_id}`}>{m.company_name}</Link></>}
          </div>
          {m.status === "failed" && <div className="error">Not sent: {m.error ?? "Google did not create it."}</div>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {m.status === "cancelled" && <span className="badge tone-neutral">Cancelled</span>}
          {m.status === "failed" && <span className="badge tone-bad">Not sent</span>}
          {m.status === "scheduled" && m.meet_url && <a className="btn secondary" href={m.meet_url} target="_blank" rel="noreferrer"><Video size={15} aria-hidden /> Join</a>}
          {m.status === "scheduled" && m.html_link && <a className="muted" href={m.html_link} target="_blank" rel="noreferrer" aria-label="Open in Google Calendar"><ExternalLink size={15} aria-hidden /></a>}
          {m.status === "scheduled" && cancellable && (
            <form action={cancelMeeting}><input type="hidden" name="id" value={m.id} />
              <ConfirmButton className="secondary danger" message={`Cancel "${m.title}" with ${m.contact_name ?? m.attendee_email}?\n\nGoogle will email them that it is cancelled.`}>Cancel</ConfirmButton></form>
          )}
        </div>
      </li>
    ))}</ul>
  );
}
