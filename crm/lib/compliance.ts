// The rules for who may be contacted (pure functions, no database). The view `lead_gate` is the single source of truth for "sendable";
// this file explains the answer in words, classifies Companies House results and parses suppression entries. Reading the gate is in complianceGate.ts.

/** Only these Companies House types may be sent outreach (limited companies, LLPs and PLCs). */
export const ELIGIBLE_TYPES = ["ltd", "llp", "plc"] as const;
/** Pre-filled when a lead is verified. Editable per lead; it is your own legal position, not legal advice. */
export const DEFAULT_CONSENT_BASIS = "PECR corporate subscriber + legitimate interest";
/** A Companies House check older than this is flagged as stale (a warning, not a block). */
export const STALE_DAYS = 90;

export const TYPE_LABELS: Record<string, string> = {
  ltd: "Private limited company", llp: "LLP", plc: "Public limited company", "private-limited-guarant-nsc": "Limited by guarantee",
  "private-unlimited": "Unlimited company", "limited-partnership": "Limited partnership", "registered-society-non-jurisdictional": "Registered society", "royal-charter": "Royal charter body",
  "oversea-company": "Overseas company", "scottish-partnership": "Scottish partnership", "charitable-incorporated-organisation": "Charity (CIO)",
};
export const typeLabel = (t: string | null | undefined) => (t ? TYPE_LABELS[t] ?? t : "Unknown");

/** Same rule as normalise_phone() in the database and agency.compliance in Python: UK numbers as digits in national format. */
export function normalisePhone(p: string | null | undefined): string | null {
  const t = (p ?? "").replace(/[^0-9+]/g, "").replace(/^(\+44|0044)0?/, "0");
  return t === "" ? null : t;
}

export type Classified = { status: "eligible" | "not_eligible"; reason: string | null };
/** Active limited company, LLP or PLC = eligible. Anything else is not, with the reason in plain words. */
export function classifyCompany(type: string | null | undefined, status: string | null | undefined): Classified {
  const t = (type ?? "").toLowerCase(), s = (status ?? "").toLowerCase();
  if (!(ELIGIBLE_TYPES as readonly string[]).includes(t)) return { status: "not_eligible", reason: `Not a limited company or LLP (${typeLabel(type)}).` };
  if (s !== "active") return { status: "not_eligible", reason: `Company status is “${status || "unknown"}”, not active.` };
  return { status: "eligible", reason: null };
}

export type Channel = "email" | "social" | "sms";
export type GateFacts = {
  compliance_status: string; company_type: string | null; company_status: string | null;
  opted_out: boolean; opted_out_at?: string | Date | null; suppressed: boolean;
};

/** Why a lead may not be contacted, in plain words. An empty list means it can be. */
export function gateReasons(g: GateFacts): string[] {
  const out: string[] = [];
  if (g.compliance_status === "unchecked") out.push("Not yet checked on Companies House: look it up first.");
  else if (g.compliance_status === "not_eligible") out.push(classifyCompany(g.company_type, g.company_status).reason ?? "Not an active limited company or LLP.");
  if (g.opted_out) out.push(`Opted out${g.opted_out_at ? ` on ${new Date(g.opted_out_at).toLocaleDateString("en-GB", { dateStyle: "medium" })}` : ""}: never contact again.`);
  if (g.suppressed) out.push("On your suppression list.");
  return out;
}

// ---------- suppression entries ----------
export type SuppressionEntry = { domain?: string; email?: string; phone?: string; company_number?: string };

/** Works out what a pasted line is: an email, phone number, company number or domain. Returns null if it is none of those. */
export function detectEntry(raw: string): SuppressionEntry | null {
  const t = raw.trim().replace(/^["']|["']$/g, "");
  if (!t) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) return { email: t.toLowerCase() };
  if (/^[+()\d][\d\s()+-]{8,}$/.test(t)) { const p = normalisePhone(t); if (p && p.replace(/\D/g, "").length >= 10 && p.replace(/\D/g, "").length <= 13) return { phone: p }; }
  const n = t.replace(/\s+/g, "").toUpperCase();
  if (/^([A-Z]{2}\d{6}|\d{8}|\d{6,7})$/.test(n)) return { company_number: n.length < 8 && /^\d+$/.test(n) ? n.padStart(8, "0") : n };
  const d = t.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return { domain: d };
  return null;
}

export function parseSuppressionLines(text: string): { entries: SuppressionEntry[]; rejected: string[] } {
  const entries: SuppressionEntry[] = [], rejected: string[] = [], seen = new Set<string>();
  for (const line of text.split(/\n|;/)) {
    if (!line.trim()) continue;
    const e = detectEntry(line);
    if (!e) { if (rejected.length < 20) rejected.push(line.trim().slice(0, 60)); continue; }
    const k = JSON.stringify(e);
    if (!seen.has(k)) { seen.add(k); entries.push(e); }
    if (entries.length >= 1000) break;
  }
  return { entries, rejected };
}
