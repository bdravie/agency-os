import { ShieldAlert, ShieldCheck } from "lucide-react";
import { clearOptOutAction, optOutAction, saveComplianceNotes } from "@/lib/complianceActions";
import { STALE_DAYS, typeLabel } from "@/lib/compliance";
import type { Gate } from "@/lib/complianceGate";
import { dateOnly } from "@/lib/format";
import LookupPanel from "./LookupPanel";
import ToastForm from "./ToastForm";
import { Pill } from "./ui";

type Company = {
  id: number; company_number: string | null; company_type: string | null; company_status: string | null; compliance_status: string;
  consent_basis: string | null; contact_source: string | null; opted_out: boolean; opted_out_at: string | Date | null; opt_out_note: string | null;
};

// Who this lead is on the public register, whether it may be contacted, and why not if it may not.
export default function ComplianceCard({ company: c, gate }: { company: Company; gate: Gate }) {
  const tone = gate.sendable ? "good" : c.compliance_status === "unchecked" ? "warn" : "bad";
  return (
    <details className="card" id="compliance" open={!gate.sendable || gate.stale}>
      <summary>
        Compliance <Pill label={gate.sendable ? "Can be contacted" : "Blocked"} tone={tone} />
        <span className="muted" style={{ fontWeight: 400 }}> · {c.compliance_status === "unchecked" ? "not verified yet" : `${typeLabel(c.company_type)}, ${c.company_status ?? "status unknown"}`}</span>
      </summary>
      <div className="stack" style={{ gap: 14, marginTop: 14 }}>
        {gate.reasons.length > 0 && (
          <div className="stack" style={{ gap: 4 }}>
            {gate.reasons.map((r) => <div key={r} className="row" style={{ gap: 8, color: "var(--bad)" }}><ShieldAlert size={16} aria-hidden /> {r}</div>)}
            <span className="muted">Emails, social messages and texts are all blocked while this applies. Nothing is ever sent from the CRM; this stops you logging or drafting a send.</span>
          </div>
        )}
        {gate.sendable && <div className="row" style={{ gap: 8, color: "var(--good)" }}><ShieldCheck size={16} aria-hidden /> Active {typeLabel(c.company_type).toLowerCase()}, not opted out, not on the suppression list.</div>}
        {gate.stale && <div className="muted" style={{ color: "var(--warn)" }}>Last checked {gate.checkedAt && dateOnly(gate.checkedAt)}, more than {STALE_DAYS} days ago. Check again before you send: companies can be struck off.</div>}

        <LookupPanel companyId={c.id} number={c.company_number} checked={c.compliance_status !== "unchecked"} />
        {gate.checkedAt && <span className="muted">Companies House checked {dateOnly(gate.checkedAt)}{c.company_number && ` · company number ${c.company_number}`}</span>}

        <ToastForm action={saveComplianceNotes} success="Saved" className="stack" style={{ gap: 10 }}>
          <input type="hidden" name="id" value={c.id} />
          <label className="stack" style={{ gap: 4 }}><span className="field-label">Why you may contact them (consent basis)</span><input name="consent_basis" defaultValue={c.consent_basis ?? ""} maxLength={300} placeholder="PECR corporate subscriber + legitimate interest" /></label>
          <label className="stack" style={{ gap: 4 }}><span className="field-label">Where their contact details came from</span><input name="contact_source" defaultValue={c.contact_source ?? ""} maxLength={200} placeholder="e.g. Company website contact page" /></label>
          <button className="secondary" style={{ alignSelf: "flex-start" }}>Save</button>
        </ToastForm>

        <div className="stack" style={{ gap: 8, paddingTop: 10, borderTop: "1px solid var(--line-soft)" }}>
          {c.opted_out ? (
            <>
              <div><b>Opted out</b> on {c.opted_out_at && dateOnly(c.opted_out_at)}{c.opt_out_note && <span className="muted"> · {c.opt_out_note}</span>}. They are on the suppression list.</div>
              <ToastForm action={clearOptOutAction} success="Opt-out cleared" confirm="Only clear this if it was recorded by mistake. If they asked not to be contacted, they must stay blocked. Clear it?"><input type="hidden" name="id" value={c.id} /><button className="link">Recorded by mistake? Clear it</button></ToastForm>
            </>
          ) : (
            <ToastForm action={optOutAction} success="Marked as opted out and added to the suppression list" confirm="Mark this company as opted out? It will be blocked everywhere and added to the suppression list." className="row">
              <input type="hidden" name="id" value={c.id} />
              <input name="note" maxLength={300} placeholder="How? e.g. Replied “no” to the first email" style={{ flex: 1, minWidth: 220 }} aria-label="How they opted out" />
              <button className="secondary">They opted out</button>
            </ToastForm>
          )}
        </div>
      </div>
    </details>
  );
}
