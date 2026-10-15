import { query } from "@/lib/db";
import { addOffer, saveOffer } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function Offers() {
  const offers = await query<any>(`SELECT * FROM offers ORDER BY active DESC, niche NULLS LAST, name`);
  return (
    <>
      <h1>Offers</h1>
      <p className="muted">Your catalogue. Prices here are the starting point for quotes; adjust per quote. Inactive offers are hidden from the quote builder.</p>
      {offers.map((o: any) => (
        <form key={o.id} action={saveOffer} className="card" style={{ marginBottom: 12, display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
          <input type="hidden" name="id" value={o.id} />
          <input name="name" defaultValue={o.name} />
          <input name="niche" defaultValue={o.niche ?? ""} placeholder="Niche" />
          <input name="setup" type="number" min="0" step="1" defaultValue={Number(o.setup_price_gbp)} title="Setup £" />
          <input name="monthly" type="number" min="0" step="1" defaultValue={Number(o.monthly_price_gbp)} title="Monthly £" />
          <input name="outcome" defaultValue={o.outcome ?? ""} placeholder="Outcome in one sentence" style={{ gridColumn: "1 / 3" }} />
          <input name="loom_url" defaultValue={o.loom_url ?? ""} placeholder="Loom link" />
          <input name="demo_path" defaultValue={o.demo_path ?? ""} placeholder="Demo folder" />
          <label className="muted"><input type="checkbox" name="active" defaultChecked={o.active} /> Active</label>
          <span />
          <span />
          <button>Save</button>
        </form>
      ))}
      <details className="card">
        <summary>Add an offer</summary>
        <form action={addOffer} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <input name="name" placeholder="Name" required />
          <input name="niche" placeholder="Niche" />
          <input name="outcome" placeholder="Outcome" style={{ flex: 1 }} />
          <input name="setup" type="number" min="0" placeholder="Setup £" />
          <input name="monthly" type="number" min="0" placeholder="Monthly £" />
          <button>Add</button>
        </form>
      </details>
    </>
  );
}
