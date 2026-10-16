"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Plus, Search } from "lucide-react";
import { addFoundAction, findCompanyAction, type AddResult, type FindState } from "@/lib/findActions";
import { startsTicked, type FoundLink } from "@/lib/findRank";
import type { NicheOption } from "@/lib/leadConfig";
import { Pill } from "./ui";

const KIND: Record<FoundLink["kind"], string> = { website: "Website", linkedin: "LinkedIn company page", instagram: "Instagram", facebook: "Facebook page" };
const TONE: Record<string, "good" | "blue" | "warn" | "neutral"> = { given: "blue", high: "good", medium: "good", low: "warn" };
const href = (l: FoundLink) => (l.kind === "website" ? `https://${l.value}` : l.value);

// Found a business you might contact on social media or the web? Type its name, see the closest website and social pages (checked against Companies House), add it, then enrich it.
export default function FindCompanyPanel({ niches, search }: { niches: NicheOption[]; search: { enabled: boolean; left: number } }) {
  const [state, action, pending] = useActionState<FindState, FormData>(findCompanyAction, null);
  const found = state?.found ?? null;
  const [chNumber, setChNumber] = useState("");
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [email, setEmail] = useState(false);
  const [research, setResearch] = useState(true);
  const [niche, setNiche] = useState("");
  const [result, setResult] = useState<AddResult | null>(null);
  const [adding, startAdd] = useTransition();

  useEffect(() => {
    if (!found) return;
    setChNumber(found.ch.best?.candidate.number ?? "");
    setTicked(Object.fromEntries(found.links.map((l) => [l.kind, startsTicked(l.confidence)])));
    setEmail(found.emails.length > 0); setResult(null);
  }, [found]);

  const add = () => startAdd(async () => {
    if (!found) return;
    const pick = (k: FoundLink["kind"]) => { const l = found.links.find((x) => x.kind === k); return l && ticked[k] ? l.value : null; };
    setResult(await addFoundAction({ name: found.name, chNumber: chNumber || null, website: pick("website"), linkedin: pick("linkedin"), instagram: pick("instagram"), facebook: pick("facebook"),
      email: email ? found.emails[0] ?? null : null, niche: niche || null, research }));
  });

  return (
    <div className="stack" style={{ gap: 16 }}>
      <form action={action} className="card stack" style={{ gap: 12 }}>
        <div className="row">
          <label className="stack" style={{ gap: 3, flex: 2, minWidth: 220 }}><span className="field-label">Company name</span><input name="name" required maxLength={100} placeholder="e.g. Brightway Supplies" autoFocus /></label>
          <label className="stack" style={{ gap: 3, flex: 1, minWidth: 160 }}><span className="field-label">Town or postcode (helps pick the right one)</span><input name="place" maxLength={60} placeholder="e.g. Leeds or LS1" /></label>
        </div>
        <label className="stack" style={{ gap: 3 }}><span className="field-label">Links you already have (optional): website, LinkedIn company page, Instagram, Facebook page</span>
          <textarea name="pasted" rows={2} placeholder="Paste any links, one per line. They are sorted automatically. Personal profiles are refused." /></label>
        {search.enabled ? (
          <label className="row muted" style={{ gap: 8 }}><input type="checkbox" name="web" disabled={search.left < 1} /> Also search the web for their website and social pages (uses 1 of your {search.left} searches left today)</label>
        ) : <p className="muted" style={{ margin: 0 }}>Web search for links is switched off (add <code>SEARCH_API_KEY</code> to enable it). The free checks below still work: Companies House, a guessed website that must prove it is theirs, and the social pages that website links to.</p>}
        <div className="row"><button disabled={pending}><Search size={15} aria-hidden /> {pending ? "Looking… (up to 30 seconds)" : "Find"}</button><span className="muted">Free. Nothing is added until you click Add.</span></div>
        {state?.error && <p className="error" role="alert">{state.error}</p>}
      </form>

      {found && (
        <section className="card stack" style={{ gap: 14 }}>
          <b>Closest matches for &ldquo;{found.name}&rdquo;{found.place ? ` near ${found.place}` : ""}</b>
          {found.existing && <p role="status" style={{ margin: 0, color: "var(--warn)" }}>Already in the CRM as <Link href={`/companies/${found.existing.id}`}>{found.existing.name}</Link>. Adding below only fills in details it doesn&apos;t have yet.</p>}

          <div className="stack" style={{ gap: 6 }}>
            <div className="field-label">Companies House</div>
            {found.ch.error && <p className="muted" style={{ margin: 0 }}>{found.ch.error}</p>}
            {found.ch.ranked.length === 0 && !found.ch.error && <p className="muted" style={{ margin: 0 }}>No company on the register with a similar name. It may be a sole trader or trade under a different name: it can still be added, but outreach stays blocked until it is verified.</p>}
            {found.ch.ranked.map((r) => (
              <label key={r.candidate.number} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                <input type="radio" name="ch" checked={chNumber === r.candidate.number} onChange={() => setChNumber(r.candidate.number)} style={{ marginTop: 4 }} />
                <span><b>{r.candidate.name}</b> <span className="muted">· {r.candidate.number} · {r.candidate.type?.toUpperCase()} · {r.candidate.status}{r.candidate.address ? ` · ${r.candidate.address}` : ""}</span>
                  <br /><span className="muted">{r.why.join(", ") || "similar name"}{r.eligible ? "" : " · can't be contacted (not an active limited company)"}</span></span>
              </label>
            ))}
            {found.ch.ranked.length > 0 && <label className="row" style={{ gap: 8 }}><input type="radio" name="ch" checked={chNumber === ""} onChange={() => setChNumber("")} /> <span className="muted">None of these (add it without a company number)</span></label>}
            {found.ch.ranked.length > 1 && !found.ch.best && <p className="muted" style={{ margin: 0 }}>No exact match, so nothing is chosen for you. Pick the right one, or none.</p>}
          </div>

          <div className="stack" style={{ gap: 6 }}>
            <div className="field-label">Website and social pages</div>
            {found.links.length === 0 && <p className="muted" style={{ margin: 0 }}>None found.</p>}
            {found.links.map((l) => (
              <label key={l.kind} className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={!!ticked[l.kind]} onChange={(e) => setTicked({ ...ticked, [l.kind]: e.target.checked })} />
                <b style={{ minWidth: 150 }}>{KIND[l.kind]}</b>
                <a href={href(l)} target="_blank" rel="noreferrer" className="row" style={{ gap: 4 }}>{l.value.replace(/^https?:\/\/(www\.)?/, "")} <ExternalLink size={12} aria-hidden /></a>
                <Pill label={l.confidence === "given" ? "you pasted" : `${l.confidence} confidence`} tone={TONE[l.confidence]} /><span className="muted">{l.how}</span>
              </label>
            ))}
            {found.emails[0] && <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /><b style={{ minWidth: 150 }}>Generic email</b>{found.emails[0]}<span className="muted">found on their website (company addresses only)</span></label>}
            {found.notes.map((n) => <p key={n} className="muted" style={{ margin: 0 }}>{n}</p>)}
          </div>

          {found.hits.length > 0 && <details><summary className="muted">What the web search returned</summary><ul style={{ marginTop: 6 }}>{found.hits.map((h, i) => <li key={i} className="muted" style={{ border: 0, padding: "2px 0" }}><b>{h.host}</b> {h.title}{h.snippet ? ` · ${h.snippet}` : ""}</li>)}</ul></details>}
          <div className="row" style={{ gap: 10 }}><span className="muted">Look by hand:</span>{found.searchLinks.map((l) => <a key={l.label} href={l.href} target="_blank" rel="noreferrer">{l.label}</a>)}<span className="muted">· paste what you find into the box above and click Find again.</span></div>

          <div className="row" style={{ gap: 12, borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
            <label className="stack" style={{ gap: 3 }}><span className="field-label">Niche (optional)</span><select value={niche} onChange={(e) => setNiche(e.target.value)}><option value="">None</option>{niches.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}</select></label>
            <label className="row muted" style={{ gap: 8, alignSelf: "flex-end" }}><input type="checkbox" checked={research} onChange={(e) => setResearch(e.target.checked)} /> Also read their website now to find gaps (free)</label>
            <button type="button" disabled={adding} onClick={add} style={{ alignSelf: "flex-end" }}><Plus size={15} aria-hidden /> {adding ? "Adding…" : found.existing ? "Fill in missing details" : "Add to the CRM"}</button>
          </div>
          {result?.error && <p className="error" role="alert">{result.error}</p>}
          {result?.ok && result.id && (
            <div className="stack" style={{ gap: 6 }} role="status">
              <span style={{ color: "var(--good)" }}>{result.ok}</span>
              <span className="row" style={{ gap: 12 }}><Link href={`/companies/${result.id}`} className="btn secondary">Open the company</Link><Link href={`/companies/${result.id}#offer`} className="btn secondary">Research it and suggest offers</Link>
                <Link href="/sourcer?tab=enrich" className="btn secondary">Enrich tab</Link></span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
