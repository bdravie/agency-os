"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles, Upload } from "lucide-react";
import { apolloImportAction, apolloRevealAction, apolloSearchAction, type ApolloStatus, type FoundPerson, type ImportResult, type RevealResult } from "@/lib/apolloActions";
import { useToast } from "./Toast";
import { Pill } from "./ui";

// Senior people at the company, found through Apollo. The search is free; revealing a work email uses an Apollo credit, so it only happens when you tick people and click.
export default function DecisionMakers({ companyId, status }: { companyId: number; status: ApolloStatus }) {
  const toast = useToast(), router = useRouter();
  const [people, setPeople] = useState<FoundPerson[] | null>(null);
  const [total, setTotal] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<RevealResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"search" | "reveal" | null>(null);
  const [, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [imp, setImp] = useState<ImportResult | null>(null);

  const importFile = (file: File | undefined) => {
    if (!file) return;
    setBusy("reveal"); setImp(null);
    start(async () => {
      try {
        const r = await apolloImportAction(companyId, await file.text());
        setImp(r);
        if (r.error) toast(r.error, "bad"); else { toast(`${r.saved?.length ?? 0} saved as contacts`); router.refresh(); }
      } finally { setBusy(null); }
    });
  };

  const blocked = !status.configured ? "Apollo is switched off: add APOLLO_API_KEY to .env (or as a Codespaces secret) and restart the CRM."
    : !status.sendable ? `Apollo is only used for verified active limited companies that can be contacted. ${status.blockedReason ?? ""}`
    : !status.domain ? "Add the company's website first (Contact details above): Apollo finds people by their website address." : null;
  const reveal = Math.min(picked.size, status.maxPerClick, status.left);

  const search = () => { setBusy("search"); setError(null); setResult(null); start(async () => {
    try {
      const r = await apolloSearchAction(companyId);
      if (r.error) { setError(r.error); return; }
      setPeople(r.people ?? []); setTotal(r.total ?? 0);
      setPicked(new Set((r.people ?? []).filter((p) => p.hasEmail && !p.saved).slice(0, status.maxPerClick).map((p) => p.id)));
    } finally { setBusy(null); }
  }); };

  const go = () => {
    if (!window.confirm(`Reveal work emails for ${reveal} ${reveal === 1 ? "person" : "people"}? This uses up to ${reveal} Apollo credit${reveal === 1 ? "" : "s"} (one per email found). Each person is saved as a contact with the reason recorded.`)) return;
    setBusy("reveal"); setError(null);
    start(async () => {
      try {
        const r = await apolloRevealAction(companyId, [...picked]);
        if (r.error) { setError(r.error); toast(r.error, "bad"); return; }
        setResult(r); toast(`${r.saved?.length ?? 0} saved as contacts`); setPeople((p) => (p ?? []).map((x) => (r.saved?.some((s) => s.name.startsWith(x.firstName)) ? { ...x, saved: true } : x))); setPicked(new Set()); router.refresh();
      } finally { setBusy(null); }
    });
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="muted" style={{ margin: 0 }}>Finds owners, directors and department heads at this company ({status.titles.slice(0, 4).join(", ")}…). The search is <b>free</b>. A work email costs <b>1 Apollo credit</b> per person, only when you click reveal. Nothing is ever sent from the CRM.</p>
      {blocked ? <p className="muted" style={{ margin: 0, color: "var(--warn)" }}>{blocked}</p> : (
        <>
          <div className="row" style={{ gap: 12 }}>
            <button type="button" className="secondary" disabled={!!busy} onClick={search}><Search size={15} aria-hidden /> {busy === "search" ? "Searching Apollo…" : "Find senior people (free)"}</button>
            <span className="muted">Credits today: {status.used} of {status.cap} used · up to {status.maxPerClick} people per click{status.saved ? ` · ${status.saved} already saved from Apollo` : ""}</span>
          </div>
          {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
          {people && people.length === 0 && <p className="muted" style={{ margin: 0 }}>Apollo found no senior people for this website{total ? "" : " (it may not know this company)"}. Try the company's other contact routes.</p>}
          {people && people.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              {people.map((p) => (
                <label key={p.id} className="row" style={{ gap: 8, opacity: p.saved ? 0.6 : 1 }}>
                  <input type="checkbox" disabled={p.saved || !p.hasEmail} checked={picked.has(p.id)} onChange={(e) => setPicked((s) => { const n = new Set(s); e.target.checked ? n.add(p.id) : n.delete(p.id); return n; })} />
                  <b style={{ minWidth: 120 }}>{p.firstName}{p.lastInitial ? ` ${p.lastInitial}.` : ""}</b><span>{p.title ?? "no job title"}</span>
                  {p.saved ? <Pill label="saved" tone="good" /> : p.hasEmail ? <Pill label="email on file" tone="blue" /> : <Pill label="no email on file" tone="neutral" />}
                </label>
              ))}
              <div className="paid">
                <div className="field-label">Uses Apollo credits · only when you click</div>
                <div className="row">
                  <button type="button" disabled={!!busy || reveal < 1} onClick={go}><Sparkles size={15} aria-hidden /> {busy === "reveal" ? "Revealing… (a few seconds each)" : `Reveal work emails (${reveal} credit${reveal === 1 ? "" : "s"})`}</button>
                  <span className="muted">Apollo shows only a last initial until you reveal. Only work addresses on this company's own website are saved.</span>
                </div>
              </div>
            </div>
          )}
          {result && (
            <div className="stack" style={{ gap: 4 }} role="status">
              {result.saved?.map((s) => <div key={s.email}>Saved <b>{s.name}</b> · {s.title ?? "no title"} · {s.email}{s.status ? ` · ${s.status}` : ""}</div>)}
              {(result.noEmail ?? 0) > 0 && <span className="muted">{result.noEmail} had no email to reveal (no credit used).</span>}
              {result.skipped?.map((s) => <span key={s} className="muted" style={{ color: "var(--warn)" }}>{s}</span>)}
              <span className="muted">Credits used: {result.credits ?? 0}. {result.note}</span>
              <span className="muted">They now appear under Contacts, and in the outreach tool as recipients.</span>
            </div>
          )}
        </>
      )}
      {!status.sendable || !status.domain ? null : (
        <div className="stack" style={{ gap: 6 }}>
          <div className="field-label">Or import a CSV you exported from Apollo's website (free, no API)</div>
          <div className="row" style={{ gap: 12 }}>
            <button type="button" className="secondary" disabled={!!busy} onClick={() => fileRef.current?.click()}><Upload size={15} aria-hidden /> Choose CSV</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden disabled={!!busy} onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ""; }} style={{ display: "none" }} />
            <span className="muted">Needs Name (or First/Last Name) and Email columns. Only work emails on {status.domain} are saved; up to 50 rows.</span>
          </div>
          {imp?.error && <p className="error" role="alert" style={{ margin: 0 }}>{imp.error}</p>}
          {imp && !imp.error && (
            <div className="stack" style={{ gap: 4 }} role="status">
              {imp.saved?.map((s) => <div key={s.email}>Saved <b>{s.name}</b> · {s.title ?? "no title"} · {s.email}</div>)}
              {imp.skipped?.map((s) => <span key={s} className="muted" style={{ color: "var(--warn)" }}>{s}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
