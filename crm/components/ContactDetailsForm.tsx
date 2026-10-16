"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Globe, Search, Sparkles } from "lucide-react";
import { checkSiteAction, guessWebsiteAction, saveContactDetails, searchWebAction, suggestPlacesAction, type SiteResult } from "@/lib/actions";
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

  function applySite(r: SiteResult) {
    if (r.error) { setNote({ text: r.error, bad: true }); return; }
    const filled = fill({ domain: r.domain, generic_email: r.emails?.[0], linkedin_url: r.linkedin ?? undefined, instagram_url: r.instagram ?? undefined, facebook_url: r.facebook ?? undefined, contact_url: r.contact_url ?? undefined });
    if (r.signals) setSignals(r.signals);
    setNote({ text: filled.length ? `Filled: ${filled.join(", ")}. Check them, then click Save.` : "Nothing new to add (the boxes are already filled, or nothing was found)." });
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
            setNote({ text: filled.length ? `Filled: ${filled.join(", ")}. Check them, then click Save.` : "Nothing new found in that text." });
          }}>Fill the boxes</button>
        </div>
      </details>

      <div>
        <div className="field-label">Free checks · no credits used</div>
        <div className="row">
          <button type="button" className="secondary" disabled={!!busy} onClick={() => run("guess", async () => { const r = await guessWebsiteAction(company.id); if (r.domain) setVerified(r.verified ?? ""); applySite(r); })}>
            <Globe size={15} aria-hidden /> {busy === "guess" ? "Trying likely addresses…" : "Guess the website"}
          </button>
          <button type="button" className="secondary" disabled={!!busy || !(f.domain || company.domain)} onClick={() => run("site", async () => applySite(await checkSiteAction(company.id, f.domain)))}>
            <Search size={15} aria-hidden /> {busy === "site" ? "Reading their site…" : "Check their website"}
          </button>
        </div>
        <p className="muted" style={{ margin: "6px 0 0" }}>These read the company&apos;s own public pages (respecting robots.txt). A guessed site must show their company number or full name to count.</p>
      </div>

      <div className="paid">
        <div className="field-label">Uses credits · only when you click</div>
        <div className="row">
          <button type="button" className="secondary" disabled={!!busy || usage.places.used >= usage.places.cap} onClick={() => run("places", async () => {
            const r = await suggestPlacesAction(company.id);
            if (r.error) { setNote({ text: r.error, bad: true }); return; }
            const filled = fill({ domain: r.domain, phone: r.phone ?? undefined });
            setNote({ text: `Google matched “${r.matched}”. ${filled.length ? `Filled: ${filled.join(", ")}. Check it, then click Save.` : "The boxes were already filled."}` });
          })}>
            <Sparkles size={15} aria-hidden /> {busy === "places" ? "Asking Google…" : "Find with Google Places"}
          </button>
          <span className="muted">1 Google request · {usage.places.used} of {usage.places.cap} used today</span>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" className="secondary" disabled={!!busy || !usage.search.enabled || usage.search.used >= usage.search.cap} onClick={() => run("search", async () => {
            const r = await searchWebAction(company.id);
            if (r.error) { setNote({ text: r.error, bad: true }); return; }
            const filled = fill({ linkedin_url: r.linkedin ?? undefined, instagram_url: r.instagram ?? undefined, facebook_url: r.facebook ?? undefined, domain: r.websites?.[0] });
            setNote({ text: `${filled.length ? `Filled: ${filled.join(", ")}. ` : "Boxes already filled. "}${r.websites?.length ? `Possible websites: ${r.websites.join(", ")}. ` : ""}Unverified: check them, then click Save.` });
          })}>
            <Search size={15} aria-hidden /> {busy === "search" ? "Searching the web…" : "Search the web for social pages"}
          </button>
          <span className="muted">{usage.search.enabled ? `1 search credit · ${usage.search.used} of ${usage.search.cap} used today` : "Switched off: add SEARCH_API_KEY to .env to enable"}</span>
        </div>
      </div>

      {note && <p className={note.bad ? "error" : "muted"} role={note.bad ? "alert" : "status"} style={{ margin: 0 }}>{note.text}</p>}
    </div>
  );
}

