import { Check, CircleAlert, Lightbulb, ShieldAlert } from "lucide-react";
import { query } from "@/lib/db";
import { suggestModel } from "@/lib/llm";
import { companyChangedSince, latestResearch } from "@/lib/research";
import { deleteSuggestionAction, saveToNotesAction } from "@/lib/suggestActions";
import type { SuggestionResult } from "@/lib/offerSuggestNormalise";
import type { Area, Finding } from "@/lib/researchAnalysis";
import { dateOnly } from "@/lib/format";
import { creditUsage } from "@/lib/usage";
import CopyButton from "./CopyButton";
import OfferSuggestionButtons from "./OfferSuggestionButtons";
import ToastForm from "./ToastForm";
import { Pill } from "./ui";

const AREAS: Area[] = ["Website", "Enquiries and booking", "Marketing", "Social media", "Reputation"];
const TONE = { high: "bad", medium: "warn", low: "neutral" } as const;

const asText = (name: string, r: SuggestionResult) =>
  [`Offer ideas for ${name}`, r.business_summary, ...r.suggestions.map((s, i) => `\n${i + 1}. ${s.title}\nAutomation: ${s.automation}\nOutcome: ${s.outcome}\nWhy: ${s.why}\nMeasure: ${s.kpi}\nPilot: ${s.pilot}\nRisk: ${s.risk}${s.needs_dpa ? "\nNeeds a data processing agreement first." : ""}`), r.opener ? `\nOpening line: ${r.opener}` : ""].join("\n");

// What the web shows about this company, where the gaps may be, and what automation to pitch (and the outcome to sell).
export default async function OfferSuggestionCard({ companyId, name }: { companyId: number; name: string }) {
  const [research, suggestions, usage] = await Promise.all([
    latestResearch(companyId),
    query<any>(`SELECT id, model, result, created_at FROM offer_suggestions WHERE company_id = $1 ORDER BY id DESC LIMIT 5`, [companyId]),
    creditUsage(),
  ]);
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'offer_suggested' AND occurred_at::date = current_date`);
  const latest = suggestions[0] as { id: number; model: string; result: SuggestionResult; created_at: Date } | undefined;
  const stale = research ? await companyChangedSince(companyId, research) : false;
  const byId = new Map((research?.findings ?? []).map((f) => [f.id, f]));
  const gaps = (research?.findings ?? []).filter((f) => f.kind !== "strength"), strengths = (research?.findings ?? []).filter((f) => f.kind === "strength");

  return (
    <section className="card" id="offer">
      <div className="row-between"><h2 style={{ margin: 0 }} className="row"><Lightbulb size={18} aria-hidden /> Offer suggestion</h2>
        <span className="muted">{research ? `Researched ${dateOnly(research.created_at)}${research.domain ? ` · ${research.domain}` : ""}` : "Not researched yet"}</span></div>
      <p className="muted" style={{ margin: "6px 0 12px" }}>Reads their own public website, works out where it may be losing enquiries, and suggests what to automate and what outcome to sell. Nothing is sent or saved to their record without you.</p>
      {stale && <p role="status" className="muted" style={{ margin: "0 0 12px", color: "var(--warn)" }}>This company&apos;s details were edited after this research ran, so the findings below may be out of date. Run the research again before relying on them.</p>}
      <OfferSuggestionButtons companyId={companyId} model={suggestModel()} usage={{ used: Number(n), cap: Number(process.env.SUGGEST_DAILY_CAP ?? 15) || 15 }}
        search={{ enabled: usage.search.enabled, left: Math.max(0, usage.search.cap - usage.search.used) }} hasSuggestion={!!latest} />

      {latest && (
        <div className="stack" style={{ gap: 12, marginTop: 16 }}>
          <div className="row-between"><b>What to pitch</b><span className="muted">Drafted {dateOnly(latest.created_at)} by {latest.model}</span></div>
          {latest.result.business_summary && <p style={{ margin: 0 }}>{latest.result.business_summary}</p>}
          {latest.result.suggestions.map((s, i) => (
            <div key={i} className="card" style={{ background: "var(--bg)", padding: 14 }}>
              <div className="row-between"><b>{i + 1}. {s.title}</b>
                <span className="row" style={{ gap: 6 }}>{s.offer_name && <Pill label={s.offer_name} tone="blue" />}<Pill label={`${s.confidence} confidence`} tone={s.confidence === "high" ? "good" : s.confidence === "medium" ? "warn" : "neutral"} />{s.needs_dpa && <Pill label="Needs a DPA first" tone="warn" />}</span></div>
              <dl style={{ margin: "10px 0 0", display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px 12px" }}>
                <dt className="muted">The automation</dt><dd style={{ margin: 0 }}>{s.automation}</dd>
                <dt className="muted">The outcome</dt><dd style={{ margin: 0 }}><b>{s.outcome}</b></dd>
                <dt className="muted">Why them</dt><dd style={{ margin: 0 }}>{s.why}</dd>
                <dt className="muted">Measure</dt><dd style={{ margin: 0 }}>{s.kpi}</dd>
                <dt className="muted">First step</dt><dd style={{ margin: 0 }}>{s.pilot}</dd>
                <dt className="muted">Watch out</dt><dd style={{ margin: 0 }}>{s.risk}</dd>
                <dt className="muted">Based on</dt><dd style={{ margin: 0 }} className="muted">{s.finding_ids.map((id) => byId.get(id)?.title ?? id).join(" · ") || "no finding (a guess)"}</dd>
              </dl>
              <ToastForm action={saveToNotesAction} success="Added to the company notes" className="row" style={{ marginTop: 8 }}><input type="hidden" name="id" value={latest.id} /><input type="hidden" name="index" value={i} /><button className="link">Add to notes</button></ToastForm>
            </div>
          ))}
          {latest.result.opener && <div><div className="field-label">A true opening line</div><p style={{ margin: "4px 0 0" }}>{latest.result.opener}</p></div>}
          {latest.result.questions.length > 0 && <div><div className="field-label">Worth asking on a call</div><ul style={{ margin: "4px 0 0" }}>{latest.result.questions.map((q, k) => <li key={k} style={{ border: 0, padding: "2px 0" }}>{q}</li>)}</ul></div>}
          <div className="row"><textarea id="offer-copy" readOnly defaultValue={asText(name, latest.result)} style={{ display: "none" }} /><CopyButton targetId="offer-copy" />
            <ToastForm action={deleteSuggestionAction} success="Deleted" confirm="Delete this suggestion?"><input type="hidden" name="id" value={latest.id} /><button className="link">Delete</button></ToastForm></div>
          <p className="muted" style={{ margin: 0 }}>Ideas, not facts: check them against the company before you use them. The AI only words what the research found.</p>
        </div>
      )}

      {research && (
        <div className="stack" style={{ gap: 12, marginTop: 18 }}>
          <b>What the research found</b>
          {AREAS.map((area) => {
            const items = gaps.filter((f) => f.area === area);
            return items.length === 0 ? null : (
              <div key={area}><div className="field-label">{area}</div>
                <ul>{items.map((f: Finding) => (
                  <li key={f.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ marginTop: 2, color: f.kind === "gap" ? "var(--warn)" : "var(--muted)" }}>{f.kind === "gap" ? <CircleAlert size={16} aria-hidden /> : <ShieldAlert size={16} aria-hidden />}</span>
                    <span><b>{f.title}</b> {f.kind === "gap" && <Pill label={f.severity} tone={TONE[f.severity]} />}<br /><span className="muted">{f.detail}</span></span>
                  </li>
                ))}</ul></div>
            );
          })}
          {strengths.length > 0 && <div><div className="field-label">Already in place</div><ul>{strengths.map((f) => <li key={f.id} className="row" style={{ gap: 8, border: 0 }}><Check size={15} aria-hidden style={{ color: "var(--good)" }} /> <b>{f.title}</b> <span className="muted">· {f.detail}</span></li>)}</ul></div>}
          {research.site && <p className="muted" style={{ margin: 0 }}>Pages read: {research.site.pagesRead.map((p) => `${p.path}${p.ok ? "" : ` (${p.note ?? "not read"})`}`).join(", ")}</p>}
          {research.web && research.web.length > 0 && <div><div className="field-label">What the web says</div><ul>{research.web.map((h, i) => <li key={i} style={{ border: 0, padding: "3px 0" }}><b>{h.host}</b> <span className="muted">{h.title}{h.snippet ? ` · ${h.snippet}` : ""}</span></li>)}</ul></div>}
          {research.limits.length > 0 && <details><summary>What couldn&apos;t be checked</summary><ul style={{ marginTop: 6 }}>{research.limits.map((l, i) => <li key={i} className="muted" style={{ border: 0, padding: "2px 0" }}>{l}</li>)}</ul></details>}
        </div>
      )}
    </section>
  );
}
