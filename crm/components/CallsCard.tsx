import Link from "next/link";
import { Phone } from "lucide-react";
import { query } from "@/lib/db";
import { dateOnly } from "@/lib/format";
import { Pill } from "./ui";

// Calls for a deal (or a company), with a button to log another.
export default async function CallsCard({ dealId, companyId }: { dealId?: number; companyId: number }) {
  const calls = await query<any>(
    `SELECT c.id, c.title, c.status, c.occurred_at, c.follow_up_on, c.next_step, (SELECT count(*) FROM call_objections o WHERE o.call_id = c.id) AS objections
       FROM calls c WHERE ${dealId ? "c.deal_id = $1" : "c.company_id = $1"} ORDER BY c.occurred_at DESC, c.id DESC LIMIT 10`, [dealId ?? companyId]);
  return (
    <section className="card" id="calls">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Calls</h2>
        <Link href={dealId ? `/calls/new?deal=${dealId}` : `/calls/new?company=${companyId}`} className="btn secondary"><Phone size={15} aria-hidden /> Log a call</Link>
      </div>
      {calls.length === 0 ? <p className="muted" style={{ marginTop: 10 }}>No calls logged. Upload a transcript or paste your notes to get the pains, objections and next step.</p> : (
        <ul style={{ marginTop: 8 }}>{calls.map((c: any) => (
          <li key={c.id}>
            <div className="row-between"><Link href={`/calls/${c.id}`} style={{ fontWeight: 600 }}>{c.title}</Link><span className="row"><span className="muted">{dateOnly(c.occurred_at)}</span><Pill label={c.status === "analysed" ? "Analysed" : c.status === "failed" ? "Failed" : "Saved"} tone={c.status === "analysed" ? "good" : c.status === "failed" ? "bad" : "neutral"} /></span></div>
            {c.status === "analysed" && <div className="muted">{c.next_step ? `Next: ${c.next_step}` : "No next step agreed"}{c.follow_up_on ? ` · follow up ${new Date(c.follow_up_on).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""} · {c.objections} objection{Number(c.objections) === 1 ? "" : "s"}</div>}
          </li>
        ))}</ul>
      )}
    </section>
  );
}
