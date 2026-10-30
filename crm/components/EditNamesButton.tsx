"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { saveCompanyNamesAction } from "@/lib/companyNamesActions";
import { jumpTo } from "@/lib/jump";
import { useToast } from "./Toast";

type Company = { id: number; name: string; trading_name: string | null; address: string | null; postcode: string | null };

// For firms that trade under another name, or have moved: the searches, research and drafts use the trading name; Companies House and compliance keep the registered name.
export default function EditNamesButton({ company }: { company: Company }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ trading_name: company.trading_name ?? "", name: company.name, address: company.address ?? "", postcode: company.postcode ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter(), toast = useToast();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const close = () => { setOpen(false); setError(null); };

  const save = () => start(async () => {
    const r = await saveCompanyNamesAction(company.id, f);
    if (r.error) { setError(r.error); return; }
    close();
    if (!r.changed) { toast("Nothing changed."); return; }
    toast("Saved. Run Auto-search in Contact details to search with the new details.");
    router.refresh();
    window.setTimeout(() => jumpTo("website"), 500);
  });

  return (
    <>
      <button type="button" className="secondary" onClick={() => { setF({ trading_name: company.trading_name ?? "", name: company.name, address: company.address ?? "", postcode: company.postcode ?? "" }); setOpen(true); }}><Pencil size={15} aria-hidden /> Edit names &amp; address</button>
      {open && (
        <div className="palette-wrap" role="dialog" aria-modal="true" aria-label="Edit names and address" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <form className="card stack dialog" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <h2 style={{ margin: 0 }}>Edit names &amp; address</h2>
            <label className="stack" style={{ gap: 4 }}><span className="field-label">Trading name (what they call themselves now)</span>
              <input value={f.trading_name} onChange={set("trading_name")} placeholder="Leave empty if it is the same as the registered name" autoFocus maxLength={120} />
              <span className="muted">Searches, research and drafts use this. Clear it to go back to the registered name.</span></label>
            <label className="stack" style={{ gap: 4 }}><span className="field-label">Registered name (legal name)</span>
              <input value={f.name} onChange={set("name")} required maxLength={120} />
              <span className="muted">Used for Companies House and compliance. Only change it if Companies House shows a new name.</span></label>
            <label className="stack" style={{ gap: 4 }}><span className="field-label">Address</span><input value={f.address} onChange={set("address")} maxLength={200} /></label>
            <label className="stack" style={{ gap: 4 }}><span className="field-label">Postcode</span><input value={f.postcode} onChange={set("postcode")} maxLength={10} style={{ width: 140 }} /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="row"><button disabled={pending}>{pending ? "Saving…" : "Save"}</button><button type="button" className="secondary" onClick={close}>Cancel</button></div>
          </form>
        </div>
      )}
    </>
  );
}
