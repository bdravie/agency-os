"use client";

import { useState, useTransition } from "react";
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
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setPrice = (id: number, k: "setup" | "monthly", v: string) => setPrices({ ...prices, [id]: { ...prices[id], [k]: Number(v) || 0 } });

  return (
    <form action={createQuote} style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
      <input type="hidden" name="deal_id" value={dealId} />
      <section className="card">
        <h2>Offers</h2>
        {offers.map((o) => (
          <div key={o.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
            <input type="checkbox" name="offer_id" value={o.id} checked={picked.has(o.id)} onChange={() => toggle(o.id)} />
            <span style={{ flex: 1 }}>{o.name}<br /><span className="muted">{o.outcome}</span></span>
            <label className="muted">Setup £ <input name={`setup_${o.id}`} type="number" min="0" step="1" value={prices[o.id].setup} onChange={(e) => setPrice(o.id, "setup", e.target.value)} style={{ width: 90 }} /></label>
            <label className="muted">Monthly £ <input name={`monthly_${o.id}`} type="number" min="0" step="1" value={prices[o.id].monthly} onChange={(e) => setPrice(o.id, "monthly", e.target.value)} style={{ width: 90 }} /></label>
          </div>
        ))}
        <label className="muted" style={{ display: "block", marginTop: 12 }}>Setup discount £ <input name="discount" type="number" min="0" step="1" value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} style={{ width: 100 }} /></label>
        <p style={{ marginTop: 8 }}><b>Setup {gbp(t.setup)}</b> (50% upfront {gbp(t.deposit)}) · <b>Monthly {gbp(t.monthly)}</b></p>
      </section>
      <section className="card">
        <h2>Scope</h2>
        <textarea name="scope" rows={6} value={scope} onChange={(e) => setScope(e.target.value)} placeholder="What will be built and delivered, in plain English" />
        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
          <button type="button" disabled={drafting || picked.size === 0} onClick={() => startDraft(async () => {
            const r = await draftScope(dealId, [...picked]);
            if (r.error) setError(r.error); else { setError(null); setScope(r.scope ?? ""); }
          })}>{drafting ? "Drafting… (about 15 seconds)" : "Draft scope with AI"}</button>
          <span className="muted">Uses the company notes, recent activity and the ticked offers. Check it before saving.</span>
        </div>
        {error && <p className="error">{error}</p>}
        <input name="timeline" placeholder="Timeline, e.g. Built and live within 10 working days of the upfront payment" style={{ marginTop: 12, width: "100%" }} />
      </section>
      <button disabled={picked.size === 0} style={{ alignSelf: "flex-start" }}>Create quote</button>
    </form>
  );
}
