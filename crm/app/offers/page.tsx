import { Package } from "lucide-react";
import { query } from "@/lib/db";
import { addBundle, addOffer, saveBundle, saveOffer } from "@/lib/offerActions";
import { BILLING, billingShort } from "@/lib/dealOffers";
import { TIERS } from "@/lib/offerCatalogue";
import { gbp } from "@/lib/quote";
import ToastForm from "@/components/ToastForm";
import NeedsYouCard from "@/components/NeedsYouCard";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offers" };

// The page leads with three offers (entry level, mid-tier, premium: `offers.tier`). Everything else that can be sold is kept,
// because deals and quotes point at it, and sits folded away under Other services and packages.

const isMonthly = (o: any) => o.billing === "monthly";
const sums = (parts: any[]) => ({
  oneOff: parts.filter((p) => !isMonthly(p)).reduce((n, p) => n + Number(p.setup_price_gbp), 0),
  monthly: parts.filter(isMonthly).reduce((n, p) => n + Number(p.monthly_price_gbp), 0),
});

function TierSelect({ value }: { value: string | null }) {
  return (
    <label>Lead offer
      <select name="tier" defaultValue={value ?? ""}>
        <option value="">Not one of the three</option>
        {TIERS.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
      </select>
    </label>
  );
}

function ServiceForm({ o, head = true }: { o: any; head?: boolean }) {
  const list = o.deliverables as string[];
  const dflt = Number(isMonthly(o) ? o.monthly_price_gbp : o.setup_price_gbp);
  return (
    <ToastForm id={head ? `offer-${o.id}` : undefined} action={saveOffer} success="Offer saved" className={head ? "card offer-product" : "offer-product"}>
      <input type="hidden" name="id" value={o.id} />
      {head && (
        <div className="offer-head">
          <div>
            <b style={{ fontSize: 16 }}>{o.name}</b>
            <div className="muted">{billingShort(o.billing)} · {o.price_min_gbp !== null ? `${gbp(o.price_min_gbp)}–${gbp(o.price_max_gbp)}${isMonthly(o) ? " a month" : ""}` : "no price range set"}{o.default_duration_days ? ` · ${o.default_duration_days} day${o.default_duration_days === 1 ? "" : "s"}` : ""}</div>
          </div>
        </div>
      )}
      <div className="offer-grid">
        <label>Name<input name="name" defaultValue={o.name} /></label>
        <label>Billing
          <select name="billing" defaultValue={o.billing}>{BILLING.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}</select>
        </label>
        <label>{isMonthly(o) ? "Default monthly fee £" : "Default price £"}<input name="default_price" type="number" min="0" step="1" defaultValue={dflt} /></label>
        <label>Default duration (days)<input name="duration" type="number" min="1" step="1" defaultValue={o.default_duration_days ?? ""} /></label>
        <label>Price from £<input name="price_min" type="number" min="0" step="1" defaultValue={o.price_min_gbp === null ? "" : Number(o.price_min_gbp)} /></label>
        <label>Price to £<input name="price_max" type="number" min="0" step="1" defaultValue={o.price_max_gbp === null ? "" : Number(o.price_max_gbp)} /></label>
        <label className="span2">Outcome in one sentence<input name="outcome" defaultValue={o.outcome ?? ""} /></label>
        <label className="span4">Deliverables checklist (one per line)
          <textarea name="deliverables" rows={Math.max(4, list.length + 1)} defaultValue={list.join("\n")} />
        </label>
        <label className="span2">Loom link<input name="loom_url" defaultValue={o.loom_url ?? ""} placeholder="https://www.loom.com/share/…" /></label>
        <label>Niche<input name="niche" defaultValue={o.niche ?? ""} /></label>
        <label>Demo folder<input name="demo_path" defaultValue={o.demo_path ?? ""} /></label>
        <TierSelect value={o.tier} />
        <label className="row muted" style={{ flexDirection: "row", gap: 6, alignSelf: "end" }}><input type="checkbox" name="active" defaultChecked={o.active} /> Active</label>
      </div>
      <div className="row"><button className="secondary">Save</button>{head && <span className="muted">When you add this to a deal, the checklist is copied, so ticking items off on one deal never changes the offer.</span>}</div>
    </ToastForm>
  );
}

function PackageForm({ b, services, inside, head = true }: { b: any; services: any[]; inside: Set<number>; head?: boolean }) {
  const { oneOff, monthly } = sums(services.filter((p) => inside.has(p.id)));
  return (
    <ToastForm action={saveBundle} success="Package saved" className={head ? "card offer-product" : "offer-product"}>
      <input type="hidden" name="id" value={b.id} />
      {head && <div className="offer-head"><div><b style={{ fontSize: 16 }}>{b.name}</b><div className="muted">{gbp(oneOff)} one-off · {gbp(monthly)}/mo at default prices</div></div></div>}
      <div className="offer-grid">
        <label>Name<input name="name" defaultValue={b.name} /></label>
        <label className="span3">Outcome in one sentence<input name="outcome" defaultValue={b.outcome ?? ""} /></label>
        <div className="span4"><div className="field-label">Services in this package</div>
          <div className="row" style={{ gap: 14 }}>{services.map((p) => (
            <label key={p.id} className="row" style={{ flexDirection: "row", gap: 6 }}><input type="checkbox" name="component" value={p.id} defaultChecked={inside.has(p.id)} /> {p.name}</label>
          ))}</div>
        </div>
        <TierSelect value={b.tier} />
        <label className="row muted" style={{ flexDirection: "row", gap: 6, alignSelf: "end" }}><input type="checkbox" name="active" defaultChecked={b.active} /> Active</label>
      </div>
      <div className="row"><button className="secondary">Save</button></div>
    </ToastForm>
  );
}

export default async function Offers() {
  const all = await query<any>(`SELECT * FROM offers ORDER BY (billing IS NULL), sort_order, active DESC, niche NULLS LAST, name`);
  const bundles = all.filter((o: any) => o.is_bundle);
  const products = all.filter((o: any) => o.billing && !o.is_bundle);
  const packages = all.filter((o: any) => !o.billing && !o.is_bundle);
  const links = await query<{ bundle_id: number; component_id: number }>(`SELECT bundle_id, component_id FROM offer_components`);
  const insideOf = (id: number) => new Set(links.filter((l) => l.bundle_id === id).map((l) => l.component_id));
  const otherBundles = bundles.filter((b: any) => !b.tier), otherProducts = products.filter((p: any) => !p.tier);
  const otherCount = otherBundles.length + otherProducts.length + packages.length;
  // A sidebar nudge can link to an offer in the folded section (a built demo with no Loom link yet), so start it open when there is one.
  const openOthers = [...otherProducts, ...packages].some((o: any) => o.active && o.demo_path && !o.loom_url);

  return (
    <>
      <PageHeader
        title="Offers"
        description="Three offers to lead with: one entry level, one mid-tier, one premium. Any price can still be changed on a deal. Everything else you can sell is kept under Other services and packages."
      />

      <NeedsYouCard href="/offers" />

      {products.length === 0 ? (
        <div className="card"><EmptyState title="No services yet" icon={<Package size={22} />}>Run <code>uv run python -m agency.seed_offers</code> or <code>npx tsx --env-file=../.env scripts/seedOffers.mts</code> (from crm/) to add the starting offers.</EmptyState></div>
      ) : (
        <section className="tier-offers" aria-label="Your three lead offers">
          {TIERS.map((t) => {
            const o = all.find((x: any) => x.tier === t.code);
            if (!o) return (
              <div key={t.code} className="card tier-offer">
                <div className="eyebrow">{t.label}</div>
                <p className="muted" style={{ margin: 0 }}>No offer here yet. Open one under Other services and packages and set its Lead offer to {t.label}.</p>
              </div>
            );
            const inside = o.is_bundle ? insideOf(o.id) : null;
            const parts = inside ? products.filter((p: any) => inside.has(p.id)) : [];
            const price = inside ? sums(parts) : sums([o]);
            const key = `${o.id}:${inside ? [...inside].join(",") : ""}`;
            return (
              <div key={key} className={`card tier-offer ${t.code}`} id={`offer-${o.id}`}>
                <div className="row-between"><div className="eyebrow">{t.label}</div>{!o.active && <span className="badge tone-neutral">Not active</span>}</div>
                <h3>{o.name}</h3>
                <div className="tier-price">
                  {price.oneOff > 0 && <>{gbp(price.oneOff)} <small>{inside ? "one-off" : billingShort(o.billing).toLowerCase()}</small></>}
                  {price.oneOff > 0 && price.monthly > 0 && <small> + </small>}
                  {price.monthly > 0 && <>{gbp(price.monthly)} <small>a month</small></>}
                  {price.oneOff === 0 && price.monthly === 0 && <small>No price set</small>}
                </div>
                {!inside && o.price_min_gbp !== null && <div className="muted" style={{ marginTop: -6 }}>Usually {gbp(o.price_min_gbp)}–{gbp(o.price_max_gbp)}{isMonthly(o) ? " a month" : ""}{o.default_duration_days ? ` · about ${o.default_duration_days} day${o.default_duration_days === 1 ? "" : "s"}` : ""}</div>}
                {o.outcome && <p style={{ margin: 0 }}>{o.outcome}</p>}
                <ul className="tier-list">
                  {inside
                    ? parts.map((p: any) => <li key={p.id}><span>{p.name}</span><span className="muted">{isMonthly(p) ? `${gbp(p.monthly_price_gbp)}/mo` : gbp(p.setup_price_gbp)}</span></li>)
                    : (o.deliverables as string[]).map((d, i) => <li key={i}><span>{d}</span></li>)}
                </ul>
                <details>
                  <summary>Edit</summary>
                  {inside ? <PackageForm b={o} services={products} inside={inside} head={false} /> : <ServiceForm o={o} head={false} />}
                </details>
              </div>
            );
          })}
        </section>
      )}

      <details className="card" open={openOthers}>
        <summary>Other services and packages ({otherCount})</summary>
        <p className="muted" style={{ margin: "10px 0 0" }}>Still available in the deal builder and quotes while Active is ticked. Untick Active to stop offering one; nothing is deleted, because past deals and quotes point at them.</p>

        <h2 style={{ margin: "22px 0 4px" }}>Packages</h2>
        <p className="muted" style={{ marginTop: 0 }}>A package has no price of its own: its price is the sum of its services. Adding one to a deal adds each service as its own line.</p>
        <div className="stack">
          {otherBundles.map((b: any) => { const inside = insideOf(b.id); return <PackageForm key={`${b.id}:${[...inside].join(",")}`} b={b} services={products} inside={inside} />; })}
          <details className="card">
            <summary>Add a package</summary>
            <ToastForm action={addBundle} success="Package added" reset className="stack" style={{ marginTop: 12, gap: 8 }}>
              <div className="row"><input name="name" placeholder="Package name" required aria-label="Package name" /><input name="outcome" placeholder="Outcome" aria-label="Outcome" style={{ flex: 1, minWidth: 200 }} /></div>
              <div className="row" style={{ gap: 14 }}>{products.map((p: any) => (
                <label key={p.id} className="row" style={{ flexDirection: "row", gap: 6 }}><input type="checkbox" name="component" value={p.id} /> {p.name}</label>
              ))}</div>
              <button className="secondary" style={{ alignSelf: "flex-start" }}>Add package</button>
            </ToastForm>
          </details>
        </div>

        <h2 style={{ margin: "26px 0 10px" }}>Services</h2>
        <div className="stack">
          {otherProducts.map((o: any) => <ServiceForm key={o.id} o={o} />)}
        </div>

        <h2 style={{ margin: "26px 0 10px" }}>Niche packages (setup + monthly)</h2>
        <p className="muted" style={{ marginTop: -4 }}>Older all-in-one packages. They work in the quote builder. To carry one on a deal with its own price and checklist, give it a billing type.</p>
        <div className="stack">
          {packages.map((o: any) => (
            <ToastForm key={o.id} id={`offer-${o.id}`} action={saveOffer} success="Offer saved" className="card offer">
              <input type="hidden" name="id" value={o.id} />
              <label>Name<input name="name" defaultValue={o.name} /></label>
              <label>Niche<input name="niche" defaultValue={o.niche ?? ""} /></label>
              <label>Setup £<input name="setup" type="number" min="0" step="1" defaultValue={Number(o.setup_price_gbp)} /></label>
              <label>Monthly £<input name="monthly" type="number" min="0" step="1" defaultValue={Number(o.monthly_price_gbp)} /></label>
              <label className="span2">Outcome in one sentence<input name="outcome" defaultValue={o.outcome ?? ""} /></label>
              <label>Loom link<input name="loom_url" defaultValue={o.loom_url ?? ""} placeholder="https://www.loom.com/share/…" /></label>
              <label>Demo folder<input name="demo_path" defaultValue={o.demo_path ?? ""} /></label>
              <label>Billing type (optional)
                <select name="billing" defaultValue=""><option value="">None: package</option>{BILLING.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}</select>
              </label>
              <div className="row-between span3">
                <label className="row" style={{ flexDirection: "row" }}><input type="checkbox" name="active" defaultChecked={o.active} /> Active (shown in quotes)</label>
                <button className="secondary">Save</button>
              </div>
            </ToastForm>
          ))}
          <details className="card">
            <summary>Add an offer</summary>
            <ToastForm action={addOffer} success="Offer added" reset className="row" style={{ marginTop: 12 }}>
              <input name="name" placeholder="Name" required aria-label="Name" />
              <select name="billing" defaultValue="" aria-label="Billing"><option value="">Package</option>{BILLING.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}</select>
              <input name="niche" placeholder="Niche" aria-label="Niche" />
              <input name="outcome" placeholder="Outcome" aria-label="Outcome" style={{ flex: 1, minWidth: 200 }} />
              <input name="default_price" type="number" min="0" placeholder="Default price £" aria-label="Default price" style={{ width: 140 }} />
              <button className="secondary">Add</button>
            </ToastForm>
          </details>
        </div>
      </details>
    </>
  );
}
