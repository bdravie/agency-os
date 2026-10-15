import { query } from "@/lib/db";
import { addOffer, saveOffer } from "@/lib/actions";
import ToastForm from "@/components/ToastForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offers" };

export default async function Offers() {
  const offers = await query<any>(`SELECT * FROM offers ORDER BY active DESC, niche NULLS LAST, name`);
  return (
    <>
      <PageHeader title="Offers" description="Your catalogue. These prices are the starting point for each quote (adjust per quote). Inactive offers are hidden from the quote builder." />
      <div className="stack">
        {offers.map((o: any) => (
          <ToastForm key={o.id} action={saveOffer} success="Offer saved" className="card offer">
            <input type="hidden" name="id" value={o.id} />
            <label>Name<input name="name" defaultValue={o.name} /></label>
            <label>Niche<input name="niche" defaultValue={o.niche ?? ""} /></label>
            <label>Setup £<input name="setup" type="number" min="0" step="1" defaultValue={Number(o.setup_price_gbp)} /></label>
            <label>Monthly £<input name="monthly" type="number" min="0" step="1" defaultValue={Number(o.monthly_price_gbp)} /></label>
            <label className="span2">Outcome in one sentence<input name="outcome" defaultValue={o.outcome ?? ""} /></label>
            <label>Loom link<input name="loom_url" defaultValue={o.loom_url ?? ""} placeholder="https://www.loom.com/share/…" /></label>
            <label>Demo folder<input name="demo_path" defaultValue={o.demo_path ?? ""} /></label>
            <div className="row-between span4">
              <label className="row" style={{ flexDirection: "row" }}><input type="checkbox" name="active" defaultChecked={o.active} /> Active (shown in quotes)</label>
              <button className="secondary">Save</button>
            </div>
          </ToastForm>
        ))}
        <details className="card">
          <summary>Add an offer</summary>
          <ToastForm action={addOffer} success="Offer added" reset className="row" style={{ marginTop: 12 }}>
            <input name="name" placeholder="Name" required aria-label="Name" />
            <input name="niche" placeholder="Niche" aria-label="Niche" />
            <input name="outcome" placeholder="Outcome" aria-label="Outcome" style={{ flex: 1, minWidth: 200 }} />
            <input name="setup" type="number" min="0" placeholder="Setup £" aria-label="Setup" style={{ width: 110 }} />
            <input name="monthly" type="number" min="0" placeholder="Monthly £" aria-label="Monthly" style={{ width: 110 }} />
            <button>Add</button>
          </ToastForm>
        </details>
      </div>
    </>
  );
}
