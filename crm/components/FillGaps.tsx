"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { fillGapsAction } from "@/lib/fillGapsActions";
import { useToast } from "./Toast";

type Left = { search: number; places: number; searchOn: boolean; placesOn: boolean };

// Lead Sourcer > Enrich: one click for every company shown. Free by default (a checked guess at the website, then the site itself);
// the paid lookups run only if ticked, one company at a time, inside today's caps. The manual search links stay below as the fail-safe.
export default function FillGaps({ ids, left }: { ids: number[]; left: Left }) {
  const router = useRouter(), toast = useToast();
  const [paid, setPaid] = useState(false);
  const [progress, setProgress] = useState<{ done: number; reached: number } | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const stop = useRef(false);
  const canPay = (left.searchOn && left.search > 0) || (left.placesOn && left.places > 0);

  const run = async () => {
    stop.current = false;
    let done = 0, reached = 0, errors = 0;
    setProgress({ done, reached }); setLast(null);
    try {
      for (const id of ids) {
        if (stop.current) break;
        const r = await fillGapsAction(id, paid && canPay).catch(() => ({ error: "failed", found: [], tried: [], reachable: false }));
        if (r.error) errors++;
        if (r.reachable) reached++;
        done++;
        setProgress({ done, reached });
      }
      const msg = `${reached} of ${done} now have a way to reach them${errors ? `, ${errors} could not be looked up` : ""}.`;
      setLast(msg); toast(msg);
      router.refresh();
    } finally { setProgress(null); }
  };

  return (
    <section className="card sx-fill">
      <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" disabled={!!progress || ids.length === 0} onClick={run}><Wand2 size={16} aria-hidden /> {progress ? `Filling in… ${progress.done} of ${ids.length}` : `Fill in the gaps for ${ids.length}`}</button>
        <span className={`sx-cost ${paid && canPay ? "paid" : "free"}`}>{paid && canPay ? "Uses credits" : "Free"}</span>
        {progress && <button type="button" className="link" onClick={() => { stop.current = true; }}>Stop</button>}
      </div>
      <label className="row" style={{ gap: 8, fontSize: 13.5, color: "var(--text-2)", alignItems: "flex-start" }}>
        <input type="checkbox" checked={paid} disabled={!canPay || !!progress} onChange={(e) => setPaid(e.target.checked)} style={{ marginTop: 3 }} />
        <span>Also use paid lookups for companies with no website: a web search ({left.searchOn ? `${left.search} left today` : "off: no SEARCH_API_KEY"}), then Google Places ({left.placesOn ? `${left.places} left today` : "off: no GOOGLE_PLACES_API_KEY"}). At most one of each per company.</span>
      </label>
      <p className="sx-hint" style={{ margin: 0 }}>For each company: a guess at its website, kept only if the page shows its company number or name; then its own site for a generic email, company social pages and a contact page. Only empty boxes are filled. Whatever is still missing stays below, with what was tried, and the search links as a last resort.</p>
      {progress && <div className="sx-progress" role="status"><div className="row"><span className="sx-dot run" /> {progress.done} of {ids.length} done · {progress.reached} now reachable</div></div>}
      {last && !progress && <p role="status" className="muted" style={{ margin: 0 }}>{last}</p>}
    </section>
  );
}
