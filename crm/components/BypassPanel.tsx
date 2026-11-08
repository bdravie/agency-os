"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, X } from "lucide-react";
import { bypassVerificationAction } from "@/lib/gateBypassActions";
import { BYPASS_REASON_MAX, BYPASS_REASON_MIN, checkBypassReason } from "@/lib/gateBypass";
import { useToast } from "./Toast";

// For a company that cannot be found on Companies House (it may be registered under a different name) but that the owner knows is a real
// limited company. Write the reason and tick the box, press the button, and a pop-up asks for the login password before anything is saved.
// Nothing is sent from here: it only lets the usual gated features work.
export default function BypassPanel({ companyId }: { companyId: number }) {
  const toast = useToast(), router = useRouter();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);      // about the reason or the tick
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const check = checkBypassReason(reason);
  const id = `bypass-${companyId}`;

  useEffect(() => {
    if (!asking) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending) close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking, pending]);

  function close() { setAsking(false); setPassword(""); setPasswordError(null); }

  function begin() {
    if (check.error) { setProblem(check.error); return; }
    if (!confirmed) { setProblem("Tick the box to confirm this is a registered limited company, LLP or PLC (not a sole trader or partnership)."); return; }
    setProblem(null); setPasswordError(null); setAsking(true);
  }

  function confirm() {
    if (!password) { setPasswordError("Type your CRM password."); return; }
    start(async () => {
      const fd = new FormData();
      fd.set("company_id", String(companyId)); fd.set("reason", reason); fd.set("password", password);
      if (confirmed) fd.set("confirm_ltd", "on");
      try {
        const r = await bypassVerificationAction(null, fd);
        if (r?.error) { setPasswordError(r.error); setPassword(""); return; }
        toast(r?.ok ?? "Bypass applied");
        close();
        router.refresh();
      } catch (e) {
        setPasswordError(e instanceof Error ? `Could not apply the bypass: ${e.message}` : "Could not apply the bypass.");
      }
    });
  }

  return (
    <details open style={{ border: "1px solid var(--warn)", borderRadius: "var(--radius-md)", padding: 16 }}>
      <summary className="row" style={{ gap: 8, cursor: "pointer", fontWeight: 650 }}><ShieldAlert size={16} aria-hidden /> Can't find it on Companies House? Bypass the check (asks for your password)</summary>
      <div className="stack" style={{ gap: 10, marginTop: 12 }}>
        <p className="muted" style={{ margin: 0 }}>
          Use this only when you are sure the business is a registered limited company, LLP or PLC, for example one that trades under a different name to the one it is registered under.
          Emailing a sole trader or an ordinary partnership is not covered by the corporate rule, so a wrong call here is your risk. It stays blocked if the company has opted out or is on your suppression list,
          and drafts, sends and daily caps work exactly as before. Apollo still needs a real Companies House match.
        </p>
        <label className="stack" style={{ gap: 4 }} htmlFor={`${id}-reason`}>
          <span className="field-label">Why you are sure it is a limited company</span>
          <textarea id={`${id}-reason`} rows={2} maxLength={BYPASS_REASON_MAX + 20} value={reason} onChange={(e) => { setReason(e.target.value); setProblem(null); }}
            placeholder="e.g. Registered as Oakwood Trading Ltd, trades as Oakwood Heating; saw it on their invoice terms" aria-describedby={`${id}-help`} />
          <span id={`${id}-help`} className="muted">Saved on the company and in the activity log. {reason.trim().length}/{BYPASS_REASON_MAX} (at least {BYPASS_REASON_MIN})</span>
        </label>
        <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => { setConfirmed(e.target.checked); setProblem(null); }} style={{ marginTop: 3 }} />
          <span>I confirm this is a registered limited company, LLP or PLC, not a sole trader or partnership.</span>
        </label>
        {problem && <p className="error" role="alert" style={{ margin: 0 }}>{problem}</p>}
        <div className="row" style={{ gap: 10 }}>
          <button type="button" onClick={begin}>Bypass for this company</button>
          <span className="muted">You will be asked for your password. You can remove the bypass again at any time.</span>
        </div>
      </div>

      {asking && (
        <div className="palette-wrap" role="dialog" aria-modal="true" aria-label="Confirm with your password" onMouseDown={(e) => { if (e.target === e.currentTarget && !pending) close(); }}>
          <form className="card stack dialog" style={{ width: "min(440px, calc(100vw - 32px))" }} onSubmit={(e) => { e.preventDefault(); confirm(); }}>
            <div className="row-between"><h2 style={{ margin: 0 }}>Confirm with your password</h2><button type="button" className="icon-btn" aria-label="Close" onClick={close} disabled={pending}><X size={18} /></button></div>
            <p className="muted" style={{ margin: 0 }}>This company isn't verified on Companies House. Enter your CRM password to treat it as a limited company that can be contacted.</p>
            <div>
              <label className="field-label" htmlFor={`${id}-password`}>Your CRM password</label>
              <input id={`${id}-password`} type="password" autoComplete="off" autoFocus value={password} onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }} style={{ width: "100%" }} />
            </div>
            {passwordError && <p className="error" role="alert" style={{ margin: 0 }}>{passwordError}</p>}
            <div className="row">
              <button disabled={pending}>{pending ? "Checking…" : "Confirm bypass"}</button>
              <button type="button" className="secondary" onClick={close} disabled={pending}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </details>
  );
}
