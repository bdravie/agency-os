"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";

type Company = { id: number; name: string; domain: string | null; status: string };

// Find a company by name, then continue to `action?company=ID`.
export default function CompanyPicker({ action }: { action: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Company[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal }).then((r) => r.json()).then((d) => setResults(d.companies ?? [])).catch(() => {}), 150);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);
  return (
    <div className="card stack" style={{ maxWidth: 560, gap: 8 }}>
      <label className="field-label" htmlFor="cp">Company</label>
      <input id="cp" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start typing a company name…" autoFocus autoComplete="off" />
      {results.length > 0 && (
        <ul className="pick-list">{results.map((c) => (
          <li key={c.id}><button type="button" className="pick" onClick={() => router.push(`${action}?company=${c.id}`)}><span className="row" style={{ gap: 8 }}><Building2 size={14} aria-hidden />{c.name}</span><span className="muted">{[c.domain, c.status].filter(Boolean).join(" · ")}</span></button></li>
        ))}</ul>
      )}
      <p className="muted" style={{ margin: 0 }}>Tip: log a call from a deal page to link it to that deal.</p>
    </div>
  );
}
