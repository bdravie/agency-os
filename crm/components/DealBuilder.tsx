"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { confirmDeal } from "@/lib/offerActions";
import { BILLING, billingShort, rangeState, totals } from "@/lib/dealOffers";
import { suggestTitle } from "@/lib/dealBuilder";
import type { BuilderPackage, BuilderService } from "@/lib/dealBuilderData";
import { gbp } from "@/lib/quote";
import { useToast } from "./Toast";

type Line = { key: number; offerId: number | null; name: string; billing: string; price: string; days: string; bundleName: string | null; min: number | null; max: number | null };
let nextKey = 1;

// Build a deal from packages, single services and custom services. Every price can be changed here and nothing is saved until Confirm.
// With a dealId the lines are added to that deal; with a companyId a new deal is created in the pipeline (stage New).
export default function DealBuilder({ packages, services, dealId, companyId }: { packages: BuilderPackage[]; services: BuilderService[]; dealId?: number; companyId?: number }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [lines, setLines] = useState<Line[]>([]);
  const [title, setTitle] = useState("");
  const [custom, setCustom] = useState({ name: "", billing: "one_off", price: "" });

  const fromService = (s: BuilderService, bundleName: string | null): Line => ({ key: nextKey++, offerId: s.id, name: s.name, billing: s.billing, price: String(s.price), days: s.days ? String(s.days) : "", bundleName, min: s.min, max: s.max });
  const addPackage = (id: number) => { const p = packages.find((x) => x.id === id); if (p) setLines((l) => [...l, ...p.services.map((s) => fromService(s, p.name))]); };
  const addService = (id: number) => { const s = services.find((x) => x.id === id); if (s) setLines((l) => [...l, fromService(s, null)]); };
  const addCustom = () => {
    const name = custom.name.trim();
    if (!name) { toast("Give the custom service a name.", "bad"); return; }
    const price = Number(custom.price);
    if (!Number.isFinite(price) || price < 0 || custom.price === "") { toast("Enter a price for the custom service.", "bad"); return; }
    setLines((l) => [...l, { key: nextKey++, offerId: null, name, billing: custom.billing, price: String(price), days: "", bundleName: null, min: null, max: null }]);
    setCustom({ name: "", billing: custom.billing, price: "" });
  };
  const set = (key: number, patch: Partial<Line>) => setLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const t = totals(lines.map((l) => ({ billing: l.billing as "one_off" | "setup" | "monthly", price: Number(l.price) || 0, credit: 0 })));
  const placeholder = suggestTitle(lines.map((l) => ({ name: l.name, bundleName: l.bundleName })));

  const confirm = () => start(async () => {
    const r = await confirmDeal({
      dealId, companyId, title,
      lines: lines.map((l) => ({ offerId: l.offerId, name: l.name, billing: l.billing, price: l.price === "" ? NaN : Number(l.price), durationDays: l.days === "" ? null : Number(l.days), bundleName: l.bundleName })),
    });
    if (r.error) { toast(r.error, "bad"); return; }
    toast(dealId ? "Added to the deal" : "Deal created in the pipeline");
    setLines([]); setTitle("");
    if (dealId) router.refresh(); else router.push(`/deals/${r.id}`);
  });

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row">
        <select aria-label="Add a package" value="" onChange={(e) => addPackage(Number(e.target.value))}>
          <option value="" disabled>Add a package…</option>
          {packages.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.services.map((s) => s.name).join(" + ")})</option>)}
        </select>
        <select aria-label="Add a single service" value="" onChange={(e) => addService(Number(e.target.value))}>
          <option value="" disabled>Add a single service…</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({billingShort(s.billing).toLowerCase()}, {gbp(s.price)})</option>)}
        </select>
      </div>
      <div className="row" aria-label="Custom service">
        <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="Custom service name" aria-label="Custom service name" maxLength={80} style={{ flex: 1, minWidth: 160 }} />
        <select value={custom.billing} onChange={(e) => setCustom({ ...custom, billing: e.target.value })} aria-label="Custom service billing">{BILLING.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}</select>
        <input value={custom.price} onChange={(e) => setCustom({ ...custom, price: e.target.value })} type="number" min="0" step="1" placeholder="Price £" aria-label="Custom service price" style={{ width: 110 }} />
        <button type="button" className="secondary" onClick={addCustom}><Plus size={14} aria-hidden /> Custom service</button>
      </div>

      {lines.length > 0 && (
        <>
          <div className="stack" style={{ gap: 8 }}>
            {lines.map((l) => {
              const state = rangeState(Number(l.price) || 0, l.min, l.max);
              return (
                <div key={l.key} className="row" style={{ gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 180 }}>
                    <b>{l.name}</b> <span className="badge tone-neutral">{billingShort(l.billing)}</span>
                    {l.offerId === null && <> <span className="badge tone-neutral">Custom</span></>}
                    {l.bundleName && <span className="muted"> · {l.bundleName}</span>}
                    {l.min !== null && <span className="muted"> · usual {gbp(l.min)}–{gbp(l.max ?? l.min)}</span>}
                    {state === "below" && <span className="error"> · below your usual range</span>}
                    {state === "above" && <span className="error"> · above your usual range</span>}
                  </span>
                  <label className="row" style={{ gap: 4 }}>{l.billing === "monthly" ? "£/mo" : "£"}
                    <input type="number" min="0" step="1" value={l.price} onChange={(e) => set(l.key, { price: e.target.value })} aria-label={`Price for ${l.name}`} style={{ width: 110 }} />
                  </label>
                  <label className="row" style={{ gap: 4 }}>Days
                    <input type="number" min="1" step="1" value={l.days} onChange={(e) => set(l.key, { days: e.target.value })} aria-label={`Days for ${l.name}`} style={{ width: 70 }} />
                  </label>
                  <button type="button" className="link" onClick={() => setLines((x) => x.filter((y) => y.key !== l.key))} aria-label={`Remove ${l.name}`}><X size={16} /></button>
                </div>
              );
            })}
          </div>
          <div className="fees" aria-label="Deal totals">
            <div><span className="muted">One-off</span><b>{gbp(t.oneOff)}</b></div>
            <div><span className="muted">Monthly</span><b>{gbp(t.monthly)}<span className="muted">/mo</span></b></div>
          </div>
          <div className="row">
            {!dealId && <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder || "Deal title"} aria-label="Deal title" maxLength={120} style={{ flex: 1, minWidth: 200 }} />}
            <button type="button" onClick={confirm} disabled={pending}>{pending ? "Saving…" : dealId ? "Confirm and add to deal" : "Confirm and create deal"}</button>
            <button type="button" className="secondary" onClick={() => setLines([])} disabled={pending}>Clear</button>
          </div>
          <p className="muted" style={{ margin: 0 }}>{dealId ? "Nothing is saved until you confirm." : "Nothing is saved until you confirm. The deal starts in the pipeline at New."} Prices and days can still be changed later on the deal.</p>
        </>
      )}
    </div>
  );
}
