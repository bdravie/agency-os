"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPastedPeopleAction, type PasteResult } from "@/lib/manualPeopleActions";
import { checkUnverifiedReason, parsePastedPeople, REASON_MAX } from "@/lib/manualPeople";
import { useToast } from "./Toast";

// Paste decision-makers you found yourself: one person per line (or paste rows straight from a spreadsheet).
export default function PasteDecisionMakers({ companyId, domain, blocked, unverifiedOk = false }: { companyId: number; domain: string | null; blocked: string | null; unverifiedOk?: boolean }) {
  const toast = useToast(), router = useRouter();
  const [text, setText] = useState("");
  const [result, setResult] = useState<PasteResult | null>(null);
  const [reason, setReason] = useState("");
  const reasonCheck = useMemo(() => checkUnverifiedReason(reason), [reason]);
  const [pending, start] = useTransition();
  const preview = useMemo(() => parsePastedPeople(text, domain), [text, domain]);

  const save = () => start(async () => {
    const r = await addPastedPeopleAction(companyId, text, unverifiedOk ? reason : null);
    setResult(r);
    if (r.error) { toast(r.error, "bad"); return; }
    toast(`${r.saved?.length ?? 0} saved as contacts`);
    if ((r.skipped?.length ?? 0) === 0) setText("");
    router.refresh();
  });

  if (blocked && !unverifiedOk) return <p className="muted">{blocked}</p>;
  return (
    <div className="stack" style={{ gap: 10 }}>
      {unverifiedOk && (
        <div className="stack" style={{ gap: 6 }}>
          <label htmlFor={`unverified-reason-${companyId}`}>
            <b>This company isn't verified yet.</b> Write why you can contact these people, or why the company can't be verified (for example, "Trades as a sole trader under a brand; owner asked me to get in touch at their stand").
          </label>
          <textarea id={`unverified-reason-${companyId}`} rows={2} maxLength={REASON_MAX + 20} value={reason} onChange={(e) => { setReason(e.target.value); setResult(null); }}
            placeholder="Your reason, in a sentence" aria-describedby={`unverified-help-${companyId}`} />
          <p id={`unverified-help-${companyId}`} className={reason && reasonCheck.error ? "error" : "muted"} style={{ margin: 0 }}>
            {reason && reasonCheck.error ? reasonCheck.error : `Saved with each person, word for word. Emails and messages stay blocked for this company until it is verified on Companies House. ${reason.trim().length}/${REASON_MAX}`}
          </p>
        </div>
      )}
      <p className="muted" style={{ margin: 0 }}>
        One person per line: <b>first name, last name, position, contact detail</b>. You can paste rows straight from a spreadsheet.
        The contact detail must be a work email{domain ? ` on ${domain}` : ""} or a LinkedIn profile link. Personal addresses and phone numbers are refused.
      </p>
      <textarea rows={5} value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} aria-label="Decision-makers to add"
        placeholder={`Alex, Example, Owner, alex@${domain ?? "theircompany.co.uk"}\nPriya, Sample, Operations Director, https://www.linkedin.com/in/priya-sample`} />
      {preview.error && <p className="error" role="alert">{preview.error}</p>}
      {preview.people.length > 0 && (
        <table>
          <thead><tr><th>Name</th><th>Position</th><th>Contact</th></tr></thead>
          <tbody>{preview.people.map((p) => <tr key={p.email ?? p.linkedin}><td>{p.name}</td><td className="muted">{p.role ?? "—"}</td><td className="muted">{p.email ?? "LinkedIn"}</td></tr>)}</tbody>
        </table>
      )}
      {(result?.skipped ?? preview.skipped).length > 0 && (
        <ul className="muted" style={{ margin: 0 }}>{(result?.skipped ?? preview.skipped).map((s, i) => <li key={i}>{s}</li>)}</ul>
      )}
      {result?.error && <p className="error" role="alert">{result.error}</p>}
      <div className="row">
        <button type="button" disabled={pending || preview.people.length === 0 || (unverifiedOk && !!reasonCheck.error)} onClick={save}>{pending ? "Saving…" : `Save ${preview.people.length || ""} ${preview.people.length === 1 ? "person" : "people"}`.replace("  ", " ")}</button>
        <span className="muted">Each is saved as a contact with how you found them recorded. Nothing is sent.</span>
      </div>
    </div>
  );
}
