"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { addApifyResultsAction, apifyPollAction, apifyResultsAction, startApifyAction, type ApifyRow, type Budget, type PollState, type StartState } from "@/lib/apifyActions";
import type { NicheOption } from "@/lib/leadConfig";
import { Pill } from "./ui";
import { useToast } from "./Toast";

const usd = (n: number) => `$${n.toFixed(n < 0.1 ? 3 : 2)}`;
const TIER = (p: number | null, skip: boolean, eligible: string | null) => (skip || eligible === "not_eligible" || p === null ? { l: "Skip", t: "bad" as const } : p >= 55 ? { l: "A", t: "good" as const } : p >= 35 ? { l: "B", t: "blue" as const } : { l: "C", t: "neutral" as const });

// Find local businesses on Google Maps through Apify. Each result is matched to Companies House (free) and ranked, so you can see which are real, contactable limited companies.
export default function ApifyPanel({ niches, budget, latest }: { niches: NicheOption[]; budget: Budget; latest: { id: number; status: string } | null }) {
  const router = useRouter(), toast = useToast();
  const [state, action, pending] = useActionState<StartState, FormData>(startApifyAction, null);
  const [runId, setRunId] = useState<number | null>(latest && ["running", "processing", "starting"].includes(latest.status) ? latest.id : null);
  const [shown, setShown] = useState<number | null>(latest && latest.status === "done" ? latest.id : null);
  const [poll, setPoll] = useState<PollState | null>(null);
  const [rows, setRows] = useState<ApifyRow[]>([]);
  const [meta, setMeta] = useState<{ costUsd: number | null; estUsd: number; query: string; location: string } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adding, startAdd] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [places, setPlaces] = useState(10);
  const [contacts, setContacts] = useState(true);
  const [nicheKey, setNicheKey] = useState("");
  const terms = niches.find((n) => n.key === nicheKey)?.terms ?? [];

  const load = async (id: number) => {
    const r = await apifyResultsAction(id);
    setRows(r.rows); setMeta(r.run ? { costUsd: r.run.costUsd, estUsd: r.run.estUsd, query: r.run.query, location: r.run.location } : null);
    setPicked(new Set(r.rows.filter((x) => !x.skip && !x.added && x.eligible === "eligible").map((x) => x.placeId)));
  };
  useEffect(() => { if (state?.id) { setRunId(state.id); setShown(null); setRows([]); setNote(null); } }, [state]);
  useEffect(() => { if (shown) void load(shown); }, [shown]);
  useEffect(() => {
    if (!runId) return;
    let stop = false;
    const tick = async () => {
      const p = await apifyPollAction(runId);
      if (stop) return;
      setPoll(p);
      if (p.status === "done") { setRunId(null); setShown(runId); router.refresh(); return; }
      if (p.status === "failed") { setRunId(null); router.refresh(); return; }
      setTimeout(tick, 3000);
    };
    tick();
    return () => { stop = true; };
  }, [runId, router]);

  const each = contacts ? budget.perPlace.withContacts : budget.perPlace.without;
  const fit = Math.min(places, budget.maxPlacesNow);
  const busy = pending || !!runId;
  const available = rows.filter((r) => !r.skip && !r.added);
  const toggle = (id: string) => setPicked((p) => { const q = new Set(p); q.has(id) ? q.delete(id) : q.add(id); return q; });
  const add = () => startAdd(async () => {
    if (!shown) return;
    const r = await addApifyResultsAction(shown, [...picked]);
    if (r.error) { toast(r.error, "bad"); return; }
    setNote(r.ok ?? null); toast("Added to the CRM"); await load(shown); router.refresh();
  });

  return (
    <div className="stack" style={{ gap: 14 }}>
      {!budget.configured && <p className="error" role="alert">The server can&apos;t see <code>APIFY_TOKEN</code>. Add it to the <code>.env</code> file in the top-level folder (or as a Codespaces secret), then restart the CRM.</p>}
      <div className="row" style={{ gap: 18 }}>
        <span><b>Today</b> <span className="muted">{usd(budget.dailyUsed)} of {usd(budget.dailyCap)} used · {usd(budget.dailyLeft)} left</span></span>
        <span><b>This month</b> <span className="muted">{usd(budget.monthlyUsed)} of {usd(budget.monthlyCap)} budget{budget.planUsd ? ` (your plan: ${usd(budget.planUsd)})` : ""}</span></span>
        <span className="muted">One place costs about {usd(budget.perPlace.withContacts)} with contact details, {usd(budget.perPlace.without)} without (estimate)</span>
      </div>

      <form action={action} className="stack" style={{ gap: 10 }}>
        <div className="row">
          <label className="stack" style={{ gap: 4 }}><span className="field-label">Niche</span>
            <select name="niche" required value={nicheKey} onChange={(e) => setNicheKey(e.target.value)}><option value="" disabled>Choose…</option>{niches.map((n) => <option key={n.key} value={n.key}>{n.label}{n.custom ? " (yours)" : ""}</option>)}</select></label>
          <label className="stack" style={{ gap: 4, flex: 1, minWidth: 180 }}><span className="field-label">What to search for</span>
            <input name="term" list="apify-terms" placeholder={terms[0] ?? "e.g. roofer"} maxLength={80} /><datalist id="apify-terms">{terms.map((t) => <option key={t} value={t} />)}</datalist></label>
          <label className="stack" style={{ gap: 4, flex: 1, minWidth: 160 }}><span className="field-label">Town or area</span><input name="location" placeholder="e.g. Leeds" maxLength={60} required /></label>
          <label className="stack" style={{ gap: 4 }}><span className="field-label">Places (max 50)</span><input name="places" type="number" min={1} max={50} value={places} onChange={(e) => setPlaces(Number(e.target.value) || 1)} style={{ width: 90 }} /></label>
          <label className="stack" style={{ gap: 4 }}><span className="field-label">Websites</span><select name="website" defaultValue="allPlaces"><option value="allPlaces">All</option><option value="withWebsite">Only with a website</option><option value="withoutWebsite">Only without</option></select></label>
        </div>
        <label className="row muted" style={{ gap: 8 }}><input type="checkbox" name="contacts" checked={contacts} onChange={(e) => setContacts(e.target.checked)} /> Contact enrichment: look on their website for generic emails and company social pages (about {usd(budget.perPlace.withContacts - budget.perPlace.without)} more per place)</label>
        <div className="paid"><div className="field-label">Uses Apify credits · only when you click</div>
          <div className="row"><button disabled={busy || !budget.configured || budget.maxPlacesNow < 1}><Search size={15} aria-hidden /> {busy ? "Searching… (a few minutes)" : "Search Google Maps"}</button>
            <span className="muted">{budget.maxPlacesNow < 1 ? (budget.blocked ?? "Today's or this month's budget is used up.") : <>Estimated cost about <b>{usd(fit * each)}</b> for {fit} place{fit === 1 ? "" : "s"}{fit < places ? ` (reduced from ${places} to fit today's budget)` : ""}. Apify requires every run to allow at least {usd(budget.minCap)}, so that is the safety cap; the number of places is what keeps the real cost down.</>}</span></div></div>
        {state?.error && <p className="error" role="alert">{state.error}</p>}
        {state?.note && <p role="status" className="muted" style={{ margin: 0 }}>{state.note}</p>}
      </form>

      {runId && poll && <p role="status" className="muted" style={{ margin: 0 }}>{poll.status === "running" ? `Apify is searching Google Maps… ${poll.message ?? ""}` : poll.status === "processing" ? `Checking each business against Companies House (free)… ${poll.processed} of ${poll.total}` : ""}{poll.error ? ` (${poll.error})` : ""}</p>}
      {poll?.status === "failed" && <p className="error" role="alert">{poll.error ?? "The search failed."}{poll.costUsd ? ` It cost ${usd(poll.costUsd)}.` : ""}</p>}

      {shown && meta && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row-between">
            <b>{available.length} new business{available.length === 1 ? "" : "es"} · {meta.query} in {meta.location}</b>
            <span className="row" style={{ gap: 10 }}>
              <span className="muted">Search cost {meta.costUsd !== null ? usd(meta.costUsd) : `about ${usd(meta.estUsd)}`}</span>
              {available.length > 0 && <>
                <button type="button" className="link" onClick={() => setPicked(new Set(available.map((r) => r.placeId)))}>Select all</button>
                <button type="button" className="link" onClick={() => setPicked(new Set())}>None</button>
                <button type="button" disabled={adding || picked.size === 0} onClick={add}><Plus size={15} aria-hidden /> {adding ? "Adding…" : `Add ${picked.size} to the CRM`}</button></>}
            </span>
          </div>
          {note && <p role="status" className="muted" style={{ margin: 0 }}>{note}</p>}
          <p className="muted" style={{ margin: 0 }}>Ranked best first. Ticked by default: businesses confirmed as active limited companies, which are the ones you can contact. Others can be added but stay blocked until you find their company number.</p>
          {rows.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing came back. Try a different phrase or a wider area.</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th /><th>Priority</th><th>Business</th><th>Where</th><th>Contact</th><th>Google</th><th>Companies House</th></tr></thead>
              <tbody>{rows.map((r) => {
                const off = !!r.skip || r.added, t = TIER(r.priority, !!r.skip, r.eligible);
                return (
                  <tr key={r.placeId} style={off ? { opacity: 0.55 } : undefined}>
                    <td><input type="checkbox" disabled={off} checked={picked.has(r.placeId)} onChange={() => toggle(r.placeId)} aria-label={`Add ${r.title}`} /></td>
                    <td><span title={r.reasons.join("\n")}><Pill label={`${t.l}${r.priority !== null ? ` · ${r.priority}` : ""}`} tone={t.t} /></span></td>
                    <td><b>{r.title}</b><div className="muted">{r.categories.slice(0, 2).join(", ")}</div></td>
                    <td className="muted">{[r.city, r.postcode].filter(Boolean).join(" ") || "-"}</td>
                    <td className="muted">{r.phone ?? "-"}{r.website && <div><a href={r.website} target="_blank" rel="noreferrer">website</a></div>}{r.emails[0] && <div>{r.emails[0]}</div>}</td>
                    <td className="muted">{r.rating !== null ? `${r.rating} ★` : "-"}{r.reviews !== null ? ` · ${r.reviews}` : ""}{r.mapsUrl && <div><a href={r.mapsUrl} target="_blank" rel="noreferrer">map</a></div>}</td>
                    <td className="muted">{r.added ? "Added" : r.skip ?? (r.eligible === "eligible" ? `Active ${r.chType?.toUpperCase()} · ${r.chNumber}` : r.eligible === "not_eligible" ? `Not eligible (${r.chStatus})` : r.match === "ambiguous" ? "Several possible matches" : "Not matched: sole trader or trading name?")}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}
