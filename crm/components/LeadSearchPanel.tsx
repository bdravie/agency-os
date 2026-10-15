"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { leadSearchStatus, startLeadSearch, type SearchState, type SearchStatus } from "@/lib/leadSearchActions";

// Find new limited companies on Companies House and add them to the CRM. Free. Runs in the background; this shows what it printed.
export default function LeadSearchPanel({ niches, latest }: { niches: { key: string; label: string }[]; latest: SearchStatus }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<SearchState, FormData>(startLeadSearch, null);
  const [run, setRun] = useState<SearchStatus>(latest);
  const [id, setId] = useState<number | null>(latest?.status === "running" ? latest.id : null);
  useEffect(() => { if (state?.id) setId(state.id); }, [state]);
  useEffect(() => {
    if (!id) return;
    let stop = false;
    const tick = async () => {
      const s = await leadSearchStatus(id);
      if (stop) return;
      setRun(s);
      if (s && s.status !== "running") { setId(null); router.refresh(); return; }
      setTimeout(tick, 3000);
    };
    tick();
    return () => { stop = true; };
  }, [id, router]);
  const busy = pending || run?.status === "running";
  return (
    <div className="stack" style={{ gap: 12 }}>
      <form action={action} className="stack" style={{ gap: 10 }}>
        <input type="hidden" name="kind" value="search" />
        <div className="row">
          <label className="stack" style={{ gap: 4 }}><span className="field-label">Niche</span>
            <select name="niche" required defaultValue="">{<option value="" disabled>Choose…</option>}{niches.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}</select></label>
          <label className="stack" style={{ gap: 4, flex: 1, minWidth: 180 }}><span className="field-label">Town or area (optional)</span><input name="location" placeholder="e.g. Manchester" maxLength={60} /></label>
          <label className="stack" style={{ gap: 4 }}><span className="field-label">How many</span><select name="limit" defaultValue="50"><option>25</option><option>50</option><option>100</option></select></label>
        </div>
        <label className="row muted" style={{ gap: 8 }}><input type="checkbox" name="dry_run" defaultChecked /> Preview only: show what it would find and save nothing</label>
        <div className="row"><button disabled={busy}><Search size={15} aria-hidden /> {busy ? "Searching… (about a minute)" : "Run search"}</button>
          <span className="muted">Free · active Ltd, LLP and PLC only · skips anything already in the CRM or on the suppression list · drops companies with filing problems</span></div>
        {state?.error && <p className="error" role="alert">{state.error}</p>}
      </form>
      <form action={action} className="row" style={{ gap: 10 }}>
        <input type="hidden" name="kind" value="enrich" />
        <button className="secondary" disabled={busy}>Find generic emails (up to 25)</button>
        <span className="muted">Looks at the website of verified leads that have one, respecting robots.txt, for info@ or hello@ style addresses only.</span>
      </form>
      {run && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="muted">{run.kind === "enrich" ? "Email search" : `Search: ${run.niche}${run.location ? `, ${run.location}` : ""}${run.dryRun ? " (preview)" : ""}`} · {run.status === "running" ? "running…" : run.status === "done" ? "finished" : "failed"}</div>
          {run.output && <pre style={{ margin: 0, padding: 12, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, whiteSpace: "pre-wrap", fontSize: 13, maxHeight: 320, overflow: "auto" }}>{run.output}</pre>}
        </div>
      )}
    </div>
  );
}
