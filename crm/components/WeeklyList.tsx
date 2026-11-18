"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ListPlus, Search, X } from "lucide-react";
import { buildWeeklyListAction, chooseWeeklyPersonAction, removeWeeklyLeadAction, searchWeeklyLeadAction } from "@/lib/weeklyListActions";
import type { WeeklyRow, WeeklyView } from "@/lib/weeklyList";
import { groupRuns, personLabel, type ListSort } from "@/lib/weeklyListMath";
import { useToast } from "./Toast";
import { Pill } from "./ui";
import RefusalText from "./RefusalText";

// Lead Sourcer > This week: the best companies waiting, one senior person suggested for each. Building the list and finding people are free.
export default function WeeklyList({ view, sort = "new" }: { view: WeeklyView; sort?: ListSort }) {
  const toast = useToast(), router = useRouter();
  const [busy, setBusy] = useState<"build" | "search" | null>(null);
  const [progress, setProgress] = useState<{ done: number; of: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  const { rows, size } = view;
  const todo = rows.filter((r) => !r.searched && !r.blocked);
  const ready = rows.filter((r) => r.chosen && !r.blocked).length;
  const full = rows.length >= size;

  const build = async () => {
    setBusy("build"); setError(null);
    try {
      const r = await buildWeeklyListAction();
      if (r.error) { setError(r.error); return; }
      toast(r.added ? `${r.added} added to this week's list` : "The list is already full");
      router.refresh();
    } finally { setBusy(null); }
  };

  // One company at a time, with a pause between, so Apollo is never hit in a burst. Stops at the first refusal that would repeat for every company.
  const findPeople = async () => {
    setBusy("search"); setError(null); stop.current = false;
    let done = 0, failed = 0;
    setProgress({ done, of: todo.length, failed });
    try {
      for (const row of todo) {
        if (stop.current) break;
        const r = await searchWeeklyLeadAction(row.id);
        if (r.error) {
          failed++;
          if (failed === 1) setError(`${row.company}: ${r.error}`);
          if (/APOLLO_API_KEY|credit|rate limit|too many/i.test(r.error)) break;
        }
        done++;
        setProgress({ done, of: todo.length, failed });
        await new Promise((res) => setTimeout(res, 600));
      }
      toast(`Searched ${done} compan${done === 1 ? "y" : "ies"}`);
      router.refresh();
    } finally { setBusy(null); setProgress(null); }
  };

  const choose = async (id: number, value: string) => {
    const r = await chooseWeeklyPersonAction(id, value || null);
    if (r?.error) toast(r.error, "bad"); else router.refresh();
  };
  const remove = async (id: number) => {
    const r = await removeWeeklyLeadAction(id);
    if (r?.error) toast(r.error, "bad"); else router.refresh();
  };

  const runs = groupRuns(rows, sort);
  const table = (list: WeeklyRow[]) => (
    <table>
      <thead><tr><th>Company</th><th>Niche</th><th>Score</th><th>Person</th><th aria-label="Remove" /></tr></thead>
      <tbody>
        {list.map((r) => (
                <tr key={r.id} className={r.blocked ? "sx-week-off" : undefined}>
                  <td data-label="Company"><Link href={`/companies/${r.companyId}`}><b>{r.company}</b></Link>{r.domain && <div className="muted">{r.domain}</div>}</td>
                  <td data-label="Niche">{r.nicheLabel}</td>
                  <td data-label="Score"><Pill label={`${r.tier} · ${r.suitability}`} tone={r.tier === "A" ? "good" : "neutral"} /></td>
                  <td data-label="Person">
                    {r.blocked ? <span className="muted">{r.blocked}</span>
                      : !r.searched ? <span className="muted">Not searched yet</span>
                      : r.candidates.length === 0 ? <span className="muted">{r.note}</span>
                      : (
                        <>
                          <select aria-label={`Person at ${r.company}`} value={r.chosen ?? ""} disabled={!!r.contactId || !!busy} onChange={(e) => choose(r.id, e.target.value)}>
                            <option value="">No one (leave out)</option>
                            {r.candidates.map((p) => <option key={p.id} value={p.id}>{personLabel(p)}{p.hasEmail ? "" : " (no email on Apollo)"}</option>)}
                          </select>
                          {r.note && !r.chosen && <div className="muted">{r.note}</div>}
                        </>
                      )}
                  </td>
                  <td><button type="button" className="link" aria-label={`Remove ${r.company} from the list`} title="Remove from this week's list" disabled={!!busy} onClick={() => remove(r.id)}><X size={15} aria-hidden /></button></td>
                </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="sx-week">
      <section className="card sx-week-head">
        <div className="sx-week-figs">
          <div className="sx-fig"><b>{rows.length}</b><span>of {size} on the list</span></div>
          <div className="sx-fig"><b>{rows.length - todo.length - rows.filter((r) => r.blocked).length}</b><span>searched</span></div>
          <div className="sx-fig"><b>{ready}</b><span>with a person chosen</span></div>
        </div>
        <ul className="sx-week-niches">
          {view.niches.map((n) => (
            <li key={n.key}><b>{n.label}</b> <span className="muted">{n.onList} of {n.share} · {n.waiting} more waiting</span></li>
          ))}
          {view.niches.length === 0 && <li className="muted">No niche uses email right now. Set one to active with email on the <Link href="/niches">Niches screen</Link>.</li>}
        </ul>
        <div className="sx-week-actions">
          <button type="button" disabled={!!busy || full || view.niches.length === 0} onClick={build}>
            <ListPlus size={16} aria-hidden /> {busy === "build" ? "Building…" : rows.length ? "Top up the list" : "Build this week's list"}
          </button>
          <span className="sx-cost free">Free</span>
          <button type="button" className="secondary" disabled={!!busy || todo.length === 0 || !view.apolloReady} onClick={findPeople}>
            <Search size={15} aria-hidden /> {busy === "search" ? "Finding people…" : `Find people for ${todo.length}`}
          </button>
          <span className="sx-cost free">Free</span>
          {busy === "search" && <button type="button" className="link" onClick={() => { stop.current = true; }}>Stop</button>}
        </div>
        {!view.apolloReady && <p className="sx-hint">Apollo is switched off: add APOLLO_API_KEY to the environment file and restart the CRM. You can still build the list.</p>}
        {progress && (
          <div className="sx-progress" role="status">
            <div className="row"><span className="sx-dot run" /> Searching Apollo: {progress.done} of {progress.of}{progress.failed ? ` · ${progress.failed} could not be searched` : ""}</div>
          </div>
        )}
        {error && <p className="error" role="alert" style={{ margin: 0 }}><RefusalText text={error} /></p>}
        <p className="sx-hint">The list is the highest-scoring companies in your email niches that are verified, have a website and have never been contacted. Finding people uses Apollo's free search and keeps a first name, last initial and job title only. No email is revealed and nothing is sent from here.</p>
      </section>

      {rows.length === 0 ? (
        <div className="sx-empty">
          <h2>No list for this week yet</h2>
          <p>Build it to pull in your best {size} companies, shared between your email niches by their weekly targets. Then find one senior person at each, free.</p>
        </div>
      ) : (
        <>
          <div className="pills" role="group" aria-label="Order">
            <Link href="/sourcer?tab=week" className={`pill${sort === "new" ? " on" : ""}`}>Newest added</Link>
            <Link href="/sourcer?tab=week&sort=fit" className={`pill${sort === "fit" ? " on" : ""}`}>Best fit</Link>
          </div>
          {sort === "fit" ? <div className="card" style={{ padding: 0 }}>{table(runs[0]?.rows ?? [])}</div> : runs.map((g, i) => (
            <details key={g.key} className="card sx-run" open={i === 0}>
              <summary>
                <b>Added {g.label}</b> <span className="muted">· {g.rows.length} compan{g.rows.length === 1 ? "y" : "ies"}</span>
                {i === 0 && runs.length > 1 && <span className="badge tone-good" style={{ marginLeft: 8 }}>Latest</span>}
              </summary>
              {table(g.rows)}
            </details>
          ))}
        </>
      )}
    </div>
  );
}
