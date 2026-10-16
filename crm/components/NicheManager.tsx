"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { addNicheAction, checkSicAction, deleteNicheAction, type NicheState } from "@/lib/nicheActions";
import type { NicheOption } from "@/lib/leadConfig";
import ConfirmButton from "./ConfirmButton";

// Add your own niche: a name plus the SIC codes Companies House files those businesses under. The codes can be checked first (free).
export default function NicheManager({ niches }: { niches: NicheOption[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<NicheState, FormData>(async (prev, form) => { const r = await addNicheAction(prev, form); if (r?.ok) router.refresh(); return r; }, null);
  const [sic, setSic] = useState("");
  const [check, setCheck] = useState<{ hits?: number; error?: string } | null>(null);
  const [checking, startCheck] = useTransition();
  const mine = niches.filter((n) => n.custom);
  return (
    <details>
      <summary>Add or manage niches</summary>
      <div className="stack" style={{ gap: 12, marginTop: 12 }}>
        <p className="muted" style={{ margin: 0 }}>
          A niche is a name plus the SIC codes (the 5-digit industry codes companies file with Companies House). Find them with the{" "}
          <a href="https://resources.companieshouse.gov.uk/sic/" target="_blank" rel="noreferrer">Companies House SIC code list</a>. Several codes are fine.
        </p>
        <form action={action} className="stack" style={{ gap: 10, maxWidth: 640 }}>
          <label className="stack" style={{ gap: 4 }}><span className="field-label">Niche name</span><input name="label" maxLength={60} placeholder="e.g. Dental practices" required /></label>
          <label className="stack" style={{ gap: 4 }}><span className="field-label">SIC codes (5 digits, separated by commas)</span>
            <span className="row" style={{ gap: 8 }}>
              <input name="sic" value={sic} onChange={(e) => { setSic(e.target.value); setCheck(null); }} placeholder="86230" style={{ flex: 1 }} required />
              <button type="button" className="secondary" disabled={checking || !sic.trim()} onClick={() => startCheck(async () => setCheck(await checkSicAction(sic)))}><ShieldCheck size={15} aria-hidden /> {checking ? "Checking…" : "Check codes"}</button>
            </span>
          </label>
          {check?.hits !== undefined && <p role="status" style={{ margin: 0, color: check.hits > 0 ? "var(--good)" : "var(--warn)" }}>{check.hits > 0 ? `Companies House has about ${check.hits.toLocaleString("en-GB")} active limited companies under these codes.` : "No active limited companies found under these codes. Double-check them."}</p>}
          {check?.error && <p className="error" role="alert">{check.error}</p>}
          <label className="stack" style={{ gap: 4 }}><span className="field-label">What they search for (optional, one per line or comma-separated)</span><input name="terms" placeholder="dentist, dental practice" /></label>
          <label className="stack" style={{ gap: 4 }}><span className="field-label">What you would offer them (optional)</span><input name="offer" maxLength={300} placeholder="e.g. Automated appointment reminders and review requests" /></label>
          <button disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Adding…" : "Add niche"}</button>
          {state?.ok && <p role="status" style={{ margin: 0, color: "var(--good)" }}>{state.ok}</p>}
          {state?.error && <p className="error" role="alert">{state.error}</p>}
        </form>
        {mine.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="field-label">Your niches</div>
            {mine.map((n) => (
              <form key={n.key} action={deleteNicheAction} className="row-between">
                <span><b>{n.label}</b> <span className="muted">· SIC {n.sic.join(", ")}</span></span>
                <input type="hidden" name="key" value={n.key} />
                <ConfirmButton className="link" message={`Remove “${n.label}” from the niche list? Companies already added keep their niche.`}>Remove</ConfirmButton>
              </form>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
