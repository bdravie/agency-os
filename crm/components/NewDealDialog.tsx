"use client";

import { useEffect, useState, useTransition } from "react";
import { Building2, X } from "lucide-react";
import { createDealAction } from "@/lib/actions";
import { useToast } from "./Toast";

type Company = { id: number; name: string; domain: string | null; status: string };

// Create a deal from the board: find the company, name the deal, add rough values.
export default function NewDealDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Company[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [title, setTitle] = useState("");
  const [setup, setSetup] = useState("");
  const [monthly, setMonthly] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (company || q.trim().length < 2) { setResults([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal }).then((r) => r.json()).then((d) => setResults(d.companies ?? [])).catch(() => {}), 150);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, company]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pick = (c: Company) => { setCompany(c); setQ(""); setResults([]); if (!title) setTitle(`${c.name}: `); };

  return (
    <div className="palette-wrap" role="dialog" aria-modal="true" aria-label="New deal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="card stack dialog" style={{ width: "min(520px, calc(100vw - 32px))" }} onSubmit={(e) => {
        e.preventDefault();
        if (!company) { setError("Choose a company first."); return; }
        start(async () => {
          const r = await createDealAction(company.id, title, Number(setup) || 0, Number(monthly) || 0);
          if (r.error || !r.id) { setError(r.error ?? "Could not create the deal."); return; }
          toast("Deal created");
          onCreated(r.id);
        });
      }}>
        <div className="row-between"><h2 style={{ margin: 0 }}>New deal</h2><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button></div>

        <div>
          <label className="field-label" htmlFor="nd-company">Company</label>
          {company ? (
            <div className="row-between chip-box"><span className="row" style={{ gap: 8 }}><Building2 size={15} aria-hidden /><b>{company.name}</b></span><button type="button" className="link" onClick={() => setCompany(null)}>Change</button></div>
          ) : (
            <>
              <input id="nd-company" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start typing a company name…" autoComplete="off" autoFocus style={{ width: "100%" }} />
              {results.length > 0 && (
                <ul className="pick-list">{results.map((c) => (
                  <li key={c.id}><button type="button" className="pick" onClick={() => pick(c)}><span>{c.name}</span><span className="muted">{[c.domain, c.status].filter(Boolean).join(" · ")}</span></button></li>
                ))}</ul>
              )}
            </>
          )}
        </div>

        <div>
          <label className="field-label" htmlFor="nd-title">Deal title</label>
          <input id="nd-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pluto Creative: weekly client report" style={{ width: "100%" }} />
        </div>
        <div className="row">
          <div><label className="field-label" htmlFor="nd-setup">Setup £</label><input id="nd-setup" type="number" min="0" step="1" value={setup} onChange={(e) => setSetup(e.target.value)} style={{ width: 130 }} /></div>
          <div><label className="field-label" htmlFor="nd-monthly">Monthly £</label><input id="nd-monthly" type="number" min="0" step="1" value={monthly} onChange={(e) => setMonthly(e.target.value)} style={{ width: 130 }} /></div>
        </div>
        <p className="muted">You can change the values later, or let a quote fill them in.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row"><button disabled={pending}>{pending ? "Creating…" : "Create deal"}</button><button type="button" className="secondary" onClick={onClose}>Cancel</button></div>
      </form>
    </div>
  );
}
