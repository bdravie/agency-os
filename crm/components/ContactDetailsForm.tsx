"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Search, Sparkles } from "lucide-react";
import { saveContactDetails, suggestPlacesAction } from "@/lib/actions";
import { addContactMethodAction } from "@/lib/contactMethodActions";
import { methodLabel } from "@/lib/contactMethods";
import { autoSearchAction, type AutoField, type AutoResult } from "@/lib/findActions";
import { extractFromText, searchLinks } from "@/lib/contact";
import type { Usage } from "@/lib/usage";
import ToastForm from "./ToastForm";
import { useToast } from "./Toast";

export type ContactCompany = {
  id: number; name: string; postcode: string | null; company_number: string | null; domain: string | null; generic_email: string | null; phone: string | null;
  linkedin_url: string | null; instagram_url: string | null; facebook_url: string | null; contact_url: string | null;
  domain_verified: string | null; site_signals: Record<string, boolean> | null;
};

const SIGNAL_LABELS: Record<string, string> = { runs_ads: "Runs ads", meta_pixel: "Meta Pixel", google_ads: "Google Ads tag", ga4: "GA4", linkedin_insight: "LinkedIn Insight", tiktok_pixel: "TikTok pixel", hubspot: "HubSpot" };

// The boxes for a company's contact routes, with free searches, a paste helper and clearly labelled paid options.
export default function ContactDetailsForm({ company, usage, compact, onSaved }: { company: ContactCompany; usage: Usage; compact?: boolean; onSaved?: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    domain: company.domain ?? "", generic_email: company.generic_email ?? "", phone: company.phone ?? "", linkedin_url: company.linkedin_url ?? "",
    instagram_url: company.instagram_url ?? "", facebook_url: company.facebook_url ?? "", contact_url: company.contact_url ?? "",
  });
  const [verified, setVerified] = useState(company.domain_verified ?? "");
  const [signals, setSignals] = useState(company.site_signals);
  const [paste, setPaste] = useState("");
  const [social, setSocial] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  /** Put suggestions into EMPTY boxes only; never overwrite what you typed. */
  function fill(s: Partial<typeof f>): string[] {
    const filled: string[] = []; const next = { ...f };
    for (const [k, v] of Object.entries(s) as [keyof typeof f, string | null | undefined][]) {
      if (v && !next[k]) { next[k] = v; filled.push(k.replace("_url", "").replace("generic_email", "email")); }
    }
    setF(next);
    return filled;
  }
  const run = (label: string, job: () => Promise<void>) => { setBusy(label); setNote(null); start(async () => { try { await job(); } finally { setBusy(null); } }); };

  const LABEL: Record<AutoField, string> = { domain: "Website", generic_email: "Email", linkedin_url: "LinkedIn", instagram_url: "Instagram", facebook_url: "Facebook", contact_url: "Contact page" };
  const [auto, setAuto] = useState<{ lines: { label: string; value: string; confidence: string; how: string; used: boolean }[]; notes: string[]; web: string | null; more: string[]; extras: { kind: string; value: string; confidence: string; how: string }[] } | null>(null);

  /** Runs the auto-search, puts what it found into EMPTY boxes only, and explains each value. Nothing is saved until you click Save. */
  function applyAuto(r: AutoResult) {
    if (r.error) { setNote({ text: r.error, bad: true }); setAuto(null); return; }
    const entries = Object.entries(r.fields ?? {}) as [AutoField, { value: string; confidence: string; how: string }][];
    const next = { ...f }; const lines: { label: string; value: string; confidence: string; how: string; used: boolean }[] = [];
    for (const [k, v] of entries) { const used = !next[k]; if (used) next[k] = v.value; lines.push({ label: LABEL[k], value: v.value, confidence: v.confidence, how: v.how, used }); }
    setF(next);
    if (r.fields?.domain && next.domain === r.fields.domain.value) setVerified(r.verified ?? "");
    if (r.signals) setSignals(r.signals);
    const w = r.web, firstEmail = r.fields?.generic_email?.value;
    const web = w?.ran ? `Web search ran: ${w.results} result${w.results === 1 ? "" : "s"}${w.matched.length ? `, matched ${w.matched.join(", ")}` : ", nothing matched this company"}${w.query ? ` (searched ${w.query})` : ""}.` : null;
    setAuto({ lines, notes: r.notes ?? [], web, more: (r.emails ?? []).filter((e) => e !== firstEmail), extras: r.extras ?? [] });
    setNote({ text: lines.some((l) => l.used) ? "Filled the empty boxes below. Check them, then click Save." : lines.length ? "Found things, but your boxes already have values, so nothing was changed." : "Nothing new found." });
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div>
        <div className="field-label">Search by hand · free</div>
        <div className="pills">
          {searchLinks(company).map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="pill" title={l.hint}>{l.label} <ExternalLink size={11} aria-hidden /></a>
          ))}
        </div>
      </div>

      <ToastForm action={saveContactDetails} success="Contact details saved" onDone={onSaved} className="stack" style={{ gap: 10 }}>
        <input type="hidden" name="company_id" value={company.id} />
        <input type="hidden" name="domain_verified" value={verified} />
        <div className={compact ? "contact-grid compact" : "contact-grid"}>
          <label>Website
            <input name="domain" value={f.domain} onChange={(e) => { set("domain")(e); setVerified(""); }} placeholder="example.co.uk" />
            {company.domain && company.domain_verified && f.domain === company.domain && <span className={`mini ${company.domain_verified === "manual" ? "" : "ok"}`}>{company.domain_verified === "company number" ? "✓ shows their company number" : company.domain_verified === "name" ? "name matches" : "entered by you"}</span>}
          </label>
          <label>Generic email
            <input name="generic_email" value={f.generic_email} onChange={set("generic_email")} placeholder="info@, hello@, enquiries@…" />
          </label>
          <label>LinkedIn company page
            <input name="linkedin_url" value={f.linkedin_url} onChange={set("linkedin_url")} placeholder="linkedin.com/company/…" />
          </label>
          <label>Instagram
            <input name="instagram_url" value={f.instagram_url} onChange={set("instagram_url")} placeholder="instagram.com/…" />
          </label>
          <label>Facebook page
            <input name="facebook_url" value={f.facebook_url} onChange={set("facebook_url")} placeholder="facebook.com/…" />
          </label>
          <label>Contact page
            <input name="contact_url" value={f.contact_url} onChange={set("contact_url")} placeholder="https://…/contact" />
          </label>
          <label>Phone
            <input name="phone" value={f.phone} onChange={set("phone")} placeholder="Switchboard number" />
          </label>
        </div>
        <p className="muted" style={{ margin: 0 }}>Company pages and generic inboxes only. Personal LinkedIn profiles and named people&apos;s emails are refused.</p>
        <div className="row"><button>Save contact details</button></div>
      </ToastForm>

      {signals && (
        <div className="row" style={{ gap: 6 }} aria-label="Signals from their website">
          <span className="muted">From their site:</span>
          {Object.entries(signals).filter(([, v]) => v).map(([k]) => <span key={k} className={`badge tone-${k === "runs_ads" ? "good" : "neutral"}`}>{SIGNAL_LABELS[k] ?? k}</span>)}
          {!Object.values(signals).some(Boolean) && <span className="muted">no tracking tags seen</span>}
        </div>
      )}

      <details>
        <summary>Paste text to fill the boxes</summary>
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a contact page, a social bio or search results. Generic emails, company pages and websites are picked out; names and personal addresses are ignored." aria-label="Pasted text" />
          <button type="button" className="secondary" style={{ alignSelf: "flex-start" }} onClick={() => {
            const x = extractFromText(paste, f.domain || null);
            const filled = fill({ generic_email: x.emails[0], linkedin_url: x.linkedin ?? undefined, instagram_url: x.instagram ?? undefined, facebook_url: x.facebook ?? undefined, domain: x.websites[0], phone: x.phones[0] });
            if (x.tiktok) setAuto((a) => ({ lines: a?.lines ?? [], notes: a?.notes ?? [], web: a?.web ?? null, more: a?.more ?? [], extras: [...(a?.extras ?? []).filter((e) => e.kind !== "tiktok"), { kind: "tiktok", value: x.tiktok!, confidence: "high", how: "from the text you pasted" }] }));
            setNote({ text: filled.length || x.tiktok ? `Filled: ${[...filled, ...(x.tiktok ? ["TikTok (use the Add button below)"] : [])].join(", ")}. Check them, then click Save.` : "Nothing new found in that text." });
          }}>Fill the boxes</button>
        </div>
      </details>

      <div>
        <div className="field-label">Auto-search · free</div>
        <div className="row">
          <button type="button" className="secondary" disabled={!!busy} onClick={() => run("auto", async () => applyAuto(await autoSearchAction(company.id, f, false)))}>
            <Search size={15} aria-hidden /> {busy === "auto" ? "Searching… (up to 30 seconds)" : "Auto-search"}
          </button>
          <span className="muted">Guesses the website (it must show their company number or full name), then reads their pages for social links, a generic email and the contact page.</span>
        </div>
      </div>

      <div className="paid">
        <div className="field-label">Uses credits · only when you click</div>
        <div className="row">
          <button type="button" disabled={!!busy || !usage.search.enabled || usage.search.used >= usage.search.cap} onClick={() => run("autopaid", async () => applyAuto(await autoSearchAction(company.id, f, true, social)))}>
            <Sparkles size={15} aria-hidden /> {busy === "autopaid" ? "Searching the web… (up to 30 seconds)" : "Auto-search with web search"}
          </button>
          <span className="muted">{usage.search.enabled ? `Does everything above, plus a web search for the website and social pages guessing can't find · 1 search credit · ${usage.search.used} of ${usage.search.cap} used today` : "Switched off: add SEARCH_API_KEY (Brave Search) to .env to enable"}</span>
        </div>
        <label className="row muted" style={{ gap: 6, marginTop: 8 }}><input type="checkbox" checked={social} onChange={(e) => setSocial(e.target.checked)} disabled={usage.search.cap - usage.search.used < 2} /> Also run a second search aimed at Instagram, Facebook and TikTok if the first misses them (1 more search credit; use it for businesses with no website)</label>
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" className="secondary" disabled={!!busy || usage.places.used >= usage.places.cap} onClick={() => run("places", async () => {
            const r = await suggestPlacesAction(company.id);
            if (r.error) { setNote({ text: r.error, bad: true }); return; }
            const filled = fill({ domain: r.domain, phone: r.phone ?? undefined });
            setNote({ text: `Google matched “${r.matched}”. ${filled.length ? `Filled: ${filled.join(", ")}. Check it, then click Save.` : "The boxes were already filled."}` });
          })}>
            <Sparkles size={15} aria-hidden /> {busy === "places" ? "Asking Google…" : "Find phone and website with Google Places"}
          </button>
          <span className="muted">1 Google request · {usage.places.used} of {usage.places.cap} used today</span>
        </div>
      </div>

      {auto && (
        <div className="stack" style={{ gap: 4 }} aria-label="What the auto-search found">
          {auto.lines.map((l) => (
            <div key={l.label} className="row" style={{ gap: 8 }}>
              <b style={{ minWidth: 100 }}>{l.label}</b><span>{l.value.replace(/^https?:\/\/(www\.)?/, "")}</span>
              <span className={`badge tone-${l.confidence === "high" ? "good" : l.confidence === "medium" ? "good" : "warn"}`}>{l.confidence} confidence</span>
              <span className="muted">{l.how}{l.used ? "" : " · not used: that box already has a value"}</span>
            </div>
          ))}
          {auto.extras.map((x) => (
            <div key={x.kind} className="row" style={{ gap: 8 }}>
              <b style={{ minWidth: 100 }}>{methodLabel(x.kind)}</b><span>{x.value.replace(/^https?:\/\/(www\.)?/, "")}</span>
              <span className="badge tone-good">{x.confidence} confidence</span><span className="muted">{x.how}</span>
              <button type="button" className="secondary" disabled={!!busy} onClick={() => run("extra", async () => {
                const r = await addContactMethodAction(company.id, x.kind, x.value, undefined, "auto-search");
                if (r.error) setNote({ text: r.error, bad: true }); else { setAuto((a) => a && { ...a, extras: a.extras.filter((e) => e.kind !== x.kind) }); toast(`${methodLabel(x.kind)} added`); onSaved?.(); }
              })}>Add as {methodLabel(x.kind)}</button>
            </div>
          ))}
          {auto.web && <span className="muted">{auto.web}</span>}
          {auto.more.length > 0 && <span className="muted">Other generic emails on their site: {auto.more.join(", ")} (copy one into the email box if you prefer it).</span>}
          <span className="muted">Only company addresses are found this way. Named people at the company are not: that needs the Apollo search, which isn&apos;t switched on yet.</span>
          {auto.notes.map((n) => <span key={n} className="muted">{n}</span>)}
        </div>
      )}

      {note && <p className={note.bad ? "error" : "muted"} role={note.bad ? "alert" : "status"} style={{ margin: 0 }}>{note.text}</p>}
    </div>
  );
}

