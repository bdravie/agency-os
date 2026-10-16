"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { lookupCompanyAction, type LookupState } from "@/lib/complianceActions";
import { typeLabel } from "@/lib/compliance";

// Free Companies House lookup by number (or by name when no number is saved). It never saves a guess: unclear matches are listed for you to choose.
export default function LookupPanel({ companyId, number, checked }: { companyId: number; number: string | null; checked: boolean }) {
  const [state, action, pending] = useActionState<LookupState, FormData>(lookupCompanyAction, null);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <form action={action} className="row" style={{ gap: 8 }}>
        <input type="hidden" name="company_id" value={companyId} />
        <input name="number" defaultValue={number ?? ""} placeholder="Company number (optional)" aria-label="Company number" style={{ width: 210 }} maxLength={12} />
        <button disabled={pending}><ShieldCheck size={15} aria-hidden /> {pending ? "Looking up…" : checked ? "Check again on Companies House" : "Look up on Companies House"}</button>
        <span className="muted">Free · leave the number blank to search by company name</span>
      </form>
      {state?.ok && <p role="status" style={{ margin: 0, color: state.eligible ? "var(--good)" : "var(--warn)" }}>{state.ok}</p>}
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      {state?.candidates && state.candidates.length > 0 && (
        <ul className="pick-list">{state.candidates.map((c) => (
          <li key={c.number}>
            <form action={action} style={{ display: "contents" }}>
              <input type="hidden" name="company_id" value={companyId} /><input type="hidden" name="number" value={c.number} />
              <button className="pick"><span><b>{c.name}</b> <span className="muted">· {c.number} · {typeLabel(c.type)} · {c.status ?? "?"}</span></span><span className="muted">{c.address}</span></button>
            </form>
          </li>
        ))}</ul>
      )}
    </div>
  );
}
