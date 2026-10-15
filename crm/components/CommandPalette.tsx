"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CornerDownLeft } from "lucide-react";
import { ALL_ITEMS } from "./nav-items";

type Result = { key: string; label: string; sub: string; href: string; icon: React.ReactNode };

// Cmd/Ctrl+K (or "/") jumps to any page or company without touching the mouse.
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [companies, setCompanies] = useState<{ id: number; name: string; domain: string | null; status: string }[]>([]);
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setQ(""); setCompanies([]); setI(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);
  useEffect(() => {
    if (q.trim().length < 2) { setCompanies([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal }).then((r) => r.json()).then((d) => setCompanies(d.companies ?? [])).catch(() => {});
    }, 150);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const results: Result[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pages = ALL_ITEMS.filter((p) => !term || p.label.toLowerCase().includes(term) || p.hint.toLowerCase().includes(term))
      .map((p) => ({ key: p.href, label: p.label, sub: p.hint, href: p.href, icon: <p.icon size={16} aria-hidden /> }));
    const cos = companies.map((c) => ({ key: `c${c.id}`, label: c.name, sub: [c.domain, c.status].filter(Boolean).join(" · "), href: `/companies/${c.id}`, icon: <Building2 size={16} aria-hidden /> }));
    return [...cos, ...pages];
  }, [q, companies]);

  useEffect(() => setI(0), [q, companies]);
  if (!open) return null;

  const go = (r: Result | undefined) => { if (r) { onClose(); router.push(r.href); } };
  return (
    <div className="palette-wrap" role="dialog" aria-modal="true" aria-label="Quick jump" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette">
        <input
          ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to a page or search companies…" aria-label="Search"
          role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={results[i] ? `pal-${results[i].key}` : undefined}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setI((n) => Math.min(n + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setI((n) => Math.max(n - 1, 0)); }
            else if (e.key === "Enter") go(results[i]);
            else if (e.key === "Escape") onClose();
          }}
        />
        <ul id="palette-list" role="listbox">
          {results.map((r, n) => (
            <li key={r.key} id={`pal-${r.key}`} role="option" aria-selected={n === i} className={n === i ? "sel" : ""} onMouseEnter={() => setI(n)} onClick={() => go(r)}>
              {r.icon}<span className="pal-label">{r.label}</span><span className="muted">{r.sub}</span>{n === i && <CornerDownLeft size={14} aria-hidden />}
            </li>
          ))}
          {results.length === 0 && <li className="muted" style={{ padding: 16 }}>No matches.</li>}
        </ul>
      </div>
    </div>
  );
}
