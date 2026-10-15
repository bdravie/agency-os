"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { addSearchResultsAction, leadSearchResults, leadSearchStatus, startLeadSearch, type SearchResult, type SearchState, type SearchStatus } from "@/lib/leadSearchActions";
import type { NicheOption } from "@/lib/leadConfig";
import NicheManager from "./NicheManager";
import { useToast } from "./Toast";

const money = (n: number | null) => (n === null ? "Unknown" : n >= 1_000_000 ? `≈ £${(n / 1_000_000).toFixed(1)}m` : `≈ £${Math.round(n / 1000)}k`);

// Find companies on Companies House, tick the ones you want, and add them to the CRM. Searching is free and saves nothing by itself.
export default function LeadSearchPanel({ niches, latest }: { niches: NicheOption[]; latest: SearchStatus }) {
  const router = useRouter(), toast = useToast();
  const [state, action, pending] = useActionState<SearchState, FormData>(startLeadSearch, null);
  const [run, setRun] = useState<SearchStatus>(latest);
  const [id, setId] = useState<number | null>(latest?.status === "running" ? latest.id : null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adding, startAdd] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const load = async (searchId: number) => {
    const r = await leadSearchResults(searchId);
    setResults(r);
    setPicked(new Set(r.filter((x) => !x.skip && !x.added).map((x) => x.number)));
  };
  useEffect(() => { if (state?.id) setId(state.id); }, [state]);
  useEffect(() => { if (latest?.kind === "search" && latest.status === "done") void load(latest.id); }, [latest]);
  useEffect(() => {
    if (!id) return;
    let stop = false;
    const tick = async () => {
      const s = await leadSearchStatus(id);
      if (stop) return;
      setRun(s);
      if (s && s.status !== "running") { setId(null); if (s.kind === "search" && s.status === "done") await load(s.id); router.refresh(); return; }
      setTimeout(tick, 3000);
    };
    tick();
    return () => { stop = true; };
  }, [id, router]);

  const busy = pending || run?.status === "running";
  const available = results.filter((r) => !r.skip && !r.added);
  const toggle = (n: string) => setPicked((p) => { const q = new Set(p); q.has(n) ? q.delete(n) : q.add(n); return q; });
  const add = () => startAdd(async () => {
    if (!run) return;
    const r = await addSearchResultsAction(run.id, [...picked]);
    if (r.error) { toast(r.error, "bad"); return; }
    setNote(r.ok ?? null); toast("Added to the CRM"); await load(run.id); router.refresh();
  });

  return (
    <div className="stack" style={{ gap: 14 }}>
      <form action={action} className="stack" style={{ gap: 10 }}>
        <input type="hidden" name="kind" value="search" />
        <div className="row">
          <label className="stack" style={{ gap: 4 }}><span className="field-label">Niche</span>
            <select name="niche" required defaultValue=""><option value="" disabled>Choose…</option>{niches.map((n) => <option key={n.key} value={n.key}>{n.label}{n.custom ? " (yours)" : ""}</option>)}</select></label>
          <label className="stack" style={{ gap: 4, flex: 1, minWidth: 180 }}><span className="field-label">Town or area (optional)</span><input name="location" placeholder="e.g. Manchester" maxLength={60} /></label>
          <label className="stack" style={{ gap: 4 }}><span className="field-label">How many to look at</span><select name="limit" defaultValue="50"><option>25</option><option>50</option><option>100</option></select></label>
        </div>
        <div className="row"><button disabled={busy}><Search size={15} aria-hidden /> {busy ? "Searching… (about a minute)" : "Search"}</button>
          <span className="muted">Free · nothing is added until you tick companies and click Add · active Ltd, LLP and PLC only · filing problems are dropped</span></div>
        {state?.error && <p className="error" role="alert">{state.error}</p>}
      </form>

      {run?.kind === "search" && run.status === "done" && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row-between">
            <b>{available.length} new compan{available.length === 1 ? "y" : "ies"} found{run.niche ? ` · ${run.niche.replace(/_/g, " ")}` : ""}{run.location ? ` · ${run.location}` : ""}</b>
            {available.length > 0 && (
              <span className="row" style={{ gap: 10 }}>
                <button type="button" className="link" onClick={() => setPicked(new Set(available.map((r) => r.number)))}>Select all</button>
                <button type="button" className="link" onClick={() => setPicked(new Set())}>None</button>
                <button type="button" disabled={adding || picked.size === 0} onClick={add}><Plus size={15} aria-hidden /> {adding ? "Adding…" : `Add ${picked.size} to the CRM`}</button>
              </span>
            )}
          </div>
          {note && <p role="status" className="muted" style={{ margin: 0 }}>{note}</p>}
          {results.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing came back. Try a wider area, or a different niche.</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th /><th>Company</th><th>Postcode</th><th>Fit</th><th>Est. revenue</th><th>Status</th></tr></thead>
              <tbody>{results.map((r) => {
                const off = !!r.skip || r.added;
                return (
                  <tr key={r.number} style={off ? { opacity: 0.55 } : undefined}>
                    <td><input type="checkbox" disabled={off} checked={picked.has(r.number)} onChange={() => toggle(r.number)} aria-label={`Add ${r.name}`} /></td>
                    <td><b>{r.name}</b><div className="muted">{r.number}</div></td>
                    <td className="muted">{r.postcode ?? "-"}</td>
                    <td title={r.notes ?? ""}>{r.fit ?? "-"}</td>
                    <td className="muted">{money(r.est)}</td>
                    <td className="muted">{r.added ? "Added" : r.skip ?? "New"}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </div>
      )}

      <form action={action} className="row" style={{ gap: 10 }}>
        <input type="hidden" name="kind" value="enrich" />
        <button className="secondary" disabled={busy}>Find generic emails (up to 25)</button>
        <span className="muted">Looks at the website of verified leads that have one, respecting robots.txt, for info@ or hello@ style addresses only.</span>
      </form>

      {run && run.status !== "done" || (run && run.kind === "enrich") ? (
        <div className="stack" style={{ gap: 6 }}>
          <div className="muted">{run!.kind === "enrich" ? "Email search" : `Search: ${run!.niche}${run!.location ? `, ${run!.location}` : ""}`} · {run!.status === "running" ? "running…" : run!.status === "done" ? "finished" : "failed"}</div>
          {run!.output && <pre style={{ margin: 0, padding: 12, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, whiteSpace: "pre-wrap", fontSize: 13, maxHeight: 240, overflow: "auto" }}>{run!.output}</pre>}
        </div>
      ) : null}

      <NicheManager niches={niches} />
    </div>
  );
}
