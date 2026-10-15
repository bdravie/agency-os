"use client";

import { useState, useTransition } from "react";
import { Check, Sparkles } from "lucide-react";
import { createQuote, draftScope } from "@/lib/actions";
import { gbp, totals } from "@/lib/quote";

type Offer = { id: number; name: string; outcome: string | null; setup: number; monthly: number };

export default function QuoteBuilder({ dealId, offers, initialIds }: { dealId: number; offers: Offer[]; initialIds: number[] }) {
  const [picked, setPicked] = useState<Set<number>>(new Set(initialIds));
  const [prices, setPrices] = useState<Record<number, { setup: number; monthly: number }>>(
    Object.fromEntries(offers.map((o) => [o.id, { setup: o.setup, monthly: o.monthly }])));
  const [discount, setDiscount] = useState(0);
  const [scope, setScope] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drafting, startDraft] = useTransition();

  const chosen = offers.filter((o) => picked.has(o.id));
  const t = totals(chosen.map((o) => ({ setup_gbp: prices[o.id].setup, monthly_gbp: prices[o.id].monthly })), discount);
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setPrice = (id: number, k: "setup" | "monthly", v: string) => setPrices({ ...prices, [id]: { ...prices[id], [k]: Number(v) || 0 } });

  return (
    <form action={createQuote}>
      <input type="hidden" name="deal_id" value={dealId} />
      <div className="split">
        <div className="stack">
          <section className="card">
            <h2>1 · Choose what's included</h2>
            <div className="stack" style={{ gap: 10 }}>
              {offers.map((o) => {
                const on = picked.has(o.id);
                return (
                  <div key={o.id} className={`offer-card${on ? " selected" : ""}`}>
                    <label className="offer-pick">
                      <input type="checkbox" name="offer_id" value={o.id} checked={on} onChange={() => toggle(o.id)} />
                      <span className="tick" aria-hidden>{on && <Check size={14} />}</span>
                      <span><b>{o.name}</b><br /><span className="muted">{o.outcome}</span></span>
                    </label>
                    <div className="offer-prices">
                      <label>Setup £<input name={`setup_${o.id}`} type="number" min="0" step="1" value={prices[o.id].setup} onChange={(e) => setPrice(o.id, "setup", e.target.value)} /></label>
                      <label>Monthly £<input name={`monthly_${o.id}`} type="number" min="0" step="1" value={prices[o.id].monthly} onChange={(e) => setPrice(o.id, "monthly", e.target.value)} /></label>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card stack" style={{ gap: 10 }}>
            <h2>2 · Scope and timeline</h2>
            <textarea name="scope" rows={6} value={scope} onChange={(e) => setScope(e.target.value)} placeholder="What will be built and delivered, in plain English" aria-label="Scope" />
            <div className="row">
              <button type="button" className="secondary" disabled={drafting || picked.size === 0} onClick={() => startDraft(async () => {
                const r = await draftScope(dealId, [...picked]);
                if (r.error) setError(r.error); else { setError(null); setScope(r.scope ?? ""); }
              })}><Sparkles size={15} aria-hidden /> {drafting ? "Drafting… (about 15 seconds)" : "Draft scope with AI"}</button>
              <span className="muted">Uses the company notes, recent activity and the ticked offers. Check it before saving.</span>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <input name="timeline" placeholder="Timeline, e.g. Built and live within 10 working days of the upfront payment" aria-label="Timeline" />
          </section>
        </div>

        <aside className="card sticky" aria-label="Quote summary">
          <h2>Summary</h2>
          {chosen.length === 0 ? <p className="muted">Tick at least one offer.</p> : (
            <ul>{chosen.map((o) => (
              <li key={o.id} className="row-between"><span>{o.name}</span><span className="muted">{gbp(prices[o.id].setup)} + {gbp(prices[o.id].monthly)}/mo</span></li>
            ))}</ul>
          )}
          <label className="row-between" style={{ margin: "12px 0" }}><span className="muted">Setup discount £</span>
            <input name="discount" type="number" min="0" step="1" value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} style={{ width: 100 }} />
          </label>
          <dl className="totals-list">
            <div><dt>Setup fee</dt><dd>{gbp(t.setup)}</dd></div>
            <div className="muted"><dt>due upfront (50%)</dt><dd>{gbp(t.deposit)}</dd></div>
            <div className="muted"><dt>due on go-live (50%)</dt><dd>{gbp(t.balance)}</dd></div>
            <div><dt>Monthly fee</dt><dd>{gbp(t.monthly)}</dd></div>
          </dl>
          <button disabled={picked.size === 0} style={{ width: "100%", marginTop: 14 }}>Create quote</button>
          <p className="muted" style={{ marginTop: 8 }}>Valid for 14 days. Nothing is sent to the client.</p>
        </aside>
      </div>
    </form>
  );
}
