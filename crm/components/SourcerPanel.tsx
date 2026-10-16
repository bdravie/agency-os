"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { sourcerAddAction, sourcerPollAction, sourcerResultsAction, startSourcerAction, type SourcerPoll, type SourcerResults, type StartState } from "@/lib/sourcerActions";
import type { Budget } from "@/lib/launch";
import type { NicheOption } from "@/lib/leadConfig";
import { OPTIONS, money } from "@/lib/sourcerFilters";
import NicheManager from "./NicheManager";
import { Pill } from "./ui";
import { useToast } from "./Toast";

const usd = (n: number) => `$${n.toFixed(n < 0.1 ? 3 : 2)}`;
const TONE: Record<string, "good" | "blue" | "neutral" | "bad"> = { A: "good", B: "blue", C: "neutral", Skip: "bad" };
const Sel = ({ name, label, options, fmt }: { name: string; label: string; options: number[]; fmt: (n: number) => string }) => (
  <label className="stack" style={{ gap: 3 }}><span className="field-label">{label}</span><select name={name} defaultValue=""><option value="">Any</option>{options.map((o) => <option key={o} value={o}>{fmt(o)}</option>)}</select></label>
);

// One search for everything: tick where to look, set your filters, and get one merged, ranked list. Searching saves nothing until you choose and add.
export default function SourcerPanel({ niches, budget, latestRunId }: { niches: NicheOption[]; budget: Budget; latestRunId: number | null }) {
  const router = useRouter(), toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [start, action, pending] = useActionState<StartState, FormData>(startSourcerAction, null);
  const [runId, setRunId] = useState<number | null>(null);
  const [shown, setShown] = useState<number | null>(latestRunId);
  const [poll, setPoll] = useState<SourcerPoll | null>(null);
  const [res, setRes] = useState<SourcerResults | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();
  const [maps, setMaps] = useState(false), [contacts, setContacts] = useState(true), [limit, setLimit] = useState(50);
  const [nicheKey, setNicheKey] = useState("");
  const terms = niches.find((n) => n.key === nicheKey)?.terms ?? [];

  const load = async (id: number, override?: Record<string, string>) => {
    const r = await sourcerResultsAction(id, override);
    setRes(r);
    setPicked(new Set((r?.rows ?? []).filter((x) => !x.skip && !x.added && x.eligible === "eligible").map((x) => x.key)));
  };
  useEffect(() => { if (shown) void load(shown); }, [shown]);
  useEffect(() => { if (start?.id) { setRunId(start.id); setShown(null); setRes(null); setNote(null); } }, [start]);
  useEffect(() => {
    if (!runId) return;
    let stop = false;
    const tick = async () => {
      const p = await sourcerPollAction(runId);
      if (stop) return;
      setPoll(p);
      if (p.status !== "running") { setRunId(null); setShown(runId); router.refresh(); return; }
      setTimeout(tick, 3000);
    };
    tick();
    return () => { stop = true; };
  }, [runId, router]);

  const places = Math.min(50, limit), each = contacts ? budget.perPlace.withContacts : budget.perPlace.without, fit = Math.min(places, budget.maxPlacesNow);
  const busy = pending || !!runId;
  const available = (res?.rows ?? []).filter((r) => !r.skip && !r.added);
  const toggle = (k: string) => setPicked((p) => { const q = new Set(p); q.has(k) ? q.delete(k) : q.add(k); return q; });
  const refilter = () => { if (!shown || !form.current) return; const o: Record<string, string> = {}; new FormData(form.current).forEach((v, k) => { if (typeof v === "string") o[k] = v; }); void load(shown, o); };
  const add = () => startAdd(async () => {
    if (!shown) return;
    const r = await sourcerAddAction(shown, [...picked]);
    if (r.error) { toast(r.error, "bad"); return; }
    setNote(r.ok ?? null); toast("Added to the CRM"); await load(shown); router.refresh();
  });

  return (
    <div className="stack" style={{ gap: 16 }}>
      <form ref={form} action={action} className="card stack" style={{ gap: 14 }}>
        <div>
          <div className="field-label" style={{ marginBottom: 6 }}>1 · What are you looking for?</div>
          <div className="row">
            <label className="stack" style={{ gap: 3 }}><span className="field-label">Niche</span>
              <select name="niche" required value={nicheKey} onChange={(e) => setNicheKey(e.target.value)}><option value="" disabled>Choose…</option>{niches.map((n) => <option key={n.key} value={n.key}>{n.label}{n.custom ? " (yours)" : ""}</option>)}</select></label>
            <label className="stack" style={{ gap: 3, flex: 1, minWidth: 160 }}><span className="field-label">Town or area</span><input name="location" placeholder="e.g. Leeds" maxLength={60} required /></label>
            <label className="stack" style={{ gap: 3, flex: 1, minWidth: 160 }}><span className="field-label">Google Maps search phrase</span><input name="term" list="sourcer-terms" placeholder={terms[0] ?? "e.g. roofer"} maxLength={80} /><datalist id="sourcer-terms">{terms.map((t) => <option key={t} value={t} />)}</datalist></label>
            <label className="stack" style={{ gap: 3 }}><span className="field-label">Company types</span><select name="types" defaultValue="limited"><option value="limited">Limited companies, LLPs and PLCs (can be contacted)</option><option value="all">Include sole traders and others (research only)</option></select></label>
          </div>
        </div>

        <div>
          <div className="field-label" style={{ marginBottom: 6 }}>2 · Filters</div>
          <div className="row" style={{ gap: 10 }}>
            <Sel name="revMin" label="Est. revenue from" options={OPTIONS.revMin} fmt={money} /><Sel name="revMax" label="up to" options={OPTIONS.revMax} fmt={money} />
            <Sel name="empMin" label="Employees from" options={OPTIONS.empMin} fmt={(n) => `${n}`} /><Sel name="empMax" label="up to" options={OPTIONS.empMax} fmt={(n) => `${n}`} />
            <Sel name="ageMin" label="Trading for at least" options={OPTIONS.ageMin} fmt={(n) => `${n} years`} />
            <label className="stack" style={{ gap: 3 }}><span className="field-label">Website</span><select name="website" defaultValue="any"><option value="any">Any</option><option value="has">Has one</option><option value="none">Doesn&apos;t have one</option></select></label>
            <label className="stack" style={{ gap: 3 }}><span className="field-label">Google rating</span><select name="rating" defaultValue="any"><option value="any">Any</option><option value="45">4.5 or more</option><option value="4">4.0 or more</option><option value="lt4">Under 4.0 (room to improve)</option></select></label>
            <Sel name="reviewsMin" label="Google reviews at least" options={OPTIONS.reviewsMin} fmt={(n) => `${n}`} />
          </div>
          <label className="row muted" style={{ gap: 8, marginTop: 8 }}><input type="checkbox" name="includeUnknown" defaultChecked /> Keep businesses where a detail isn&apos;t known (Companies House only holds real turnover for some companies, and ratings come from Google Maps)</label>
        </div>

        <div>
          <div className="field-label" style={{ marginBottom: 6 }}>3 · Where to look</div>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" name="src_ch" defaultChecked /> <b>Companies House</b> <Pill label="free" tone="good" /><span className="muted">Active limited companies by industry code and area, with filing health and size. Every Google Maps result is also matched to it.</span></label>
          <label className="row" style={{ gap: 8, marginTop: 6 }}><input type="checkbox" name="src_maps" checked={maps} onChange={(e) => setMaps(e.target.checked)} disabled={!budget.configured} /> <b>Google Maps (Apify)</b> <Pill label="uses credits" tone="warn" /><span className="muted">Phone, website, rating, reviews, exact location and generic emails for local businesses.</span></label>
          {!budget.configured && <p className="muted" style={{ margin: "4px 0 0 26px" }}>Add <code>APIFY_TOKEN</code> to switch this on.</p>}
          {maps && (
            <div className="paid" style={{ marginTop: 8 }}>
              <div className="field-label">Uses Apify credits · only when you click Search</div>
              <div className="row" style={{ gap: 18 }}>
                <span><b>Today</b> <span className="muted">{usd(budget.dailyUsed)} of {usd(budget.dailyCap)} used</span></span>
                <span><b>This month</b> <span className="muted">{usd(budget.monthlyUsed)} of {usd(budget.monthlyCap)}</span></span>
                <label className="row muted" style={{ gap: 6 }}><input type="checkbox" name="contacts" checked={contacts} onChange={(e) => setContacts(e.target.checked)} /> Contact enrichment (+{usd(budget.perPlace.withContacts - budget.perPlace.without)} a place)</label>
              </div>
              <p className="muted" style={{ margin: "6px 0 0" }}>{budget.maxPlacesNow < 1 ? (budget.blocked ?? "Today's budget is used up.") : <>Estimated cost about <b>{usd(fit * each)}</b> for {fit} place{fit === 1 ? "" : "s"}{fit < places ? ` (reduced from ${places} to fit today's budget)` : ""}. Apify requires every run to allow at least {usd(budget.minCap)} as a safety cap; the number of places is what keeps the real cost down.</>}</p>
            </div>
          )}
        </div>

        <div className="row">
          <label className="stack" style={{ gap: 3 }}><span className="field-label">How many to look at</span><select name="limit" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>{OPTIONS.limit.map((n) => <option key={n}>{n}</option>)}</select></label>
          <button disabled={busy} style={{ alignSelf: "flex-end" }}><Search size={15} aria-hidden /> {busy ? "Searching… (a few minutes)" : "Search"}</button>
          <span className="muted" style={{ alignSelf: "flex-end" }}>Nothing is added until you tick businesses below and click Add.</span>
        </div>
        {start?.error && <p className="error" role="alert">{start.error}</p>}
        {start?.notes?.map((n) => <p key={n} role="status" className="muted" style={{ margin: 0, color: "var(--warn)" }}>{n}</p>)}
      </form>

      {poll && (runId || poll.status === "failed") && (
        <div className="card stack" style={{ gap: 6 }} role="status">
          {poll.parts.map((p) => <div key={p.key} className="row" style={{ gap: 8 }}><Pill label={p.label} tone={p.state === "done" ? "good" : p.state === "failed" ? "bad" : "blue"} /><span className={p.state === "failed" ? "error" : "muted"}>{p.state === "done" ? "Done: " : p.state === "failed" ? "Failed: " : ""}{p.message}</span></div>)}
        </div>
      )}

      {res && shown && (
        <section className="card stack" style={{ gap: 10 }}>
          <div className="row-between">
            <b>{available.length} new business{available.length === 1 ? "" : "es"} · ranked by suitability</b>
            <span className="row" style={{ gap: 10 }}>
              {res.mapsCostUsd !== null || res.mapsEstUsd !== null ? <span className="muted">Google Maps cost {res.mapsCostUsd !== null ? usd(res.mapsCostUsd) : `about ${usd(res.mapsEstUsd ?? 0)}`}</span> : null}
              {available.length > 0 && <>
                <button type="button" className="link" onClick={() => setPicked(new Set(available.map((r) => r.key)))}>Select all</button>
                <button type="button" className="link" onClick={() => setPicked(new Set())}>None</button>
                <button type="button" disabled={adding || picked.size === 0} onClick={add}><Plus size={15} aria-hidden /> {adding ? "Adding…" : `Add ${picked.size} to the CRM`}</button></>}
            </span>
          </div>
          {note && <p role="status" className="muted" style={{ margin: 0 }}>{note}</p>}
          {res.warnings.map((w) => <p key={w} className="muted" style={{ margin: 0, color: "var(--warn)" }}>{w}</p>)}
          <div className="row" style={{ gap: 10 }}>
            <span className="muted">{res.found} found{res.dropped.length ? `, ${res.found - res.rows.length} hidden by your filters` : ""}.</span>
            <button type="button" className="link" onClick={refilter}>Apply the filters above to these results</button>
          </div>
          {res.dropped.length > 0 && <details><summary className="muted">What the filters hid</summary><ul style={{ marginTop: 6 }}>{res.dropped.map(([why, n]) => <li key={why} className="muted" style={{ border: 0, padding: "2px 0" }}>{n} · {why}</li>)}</ul></details>}
          {res.rows.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing matched. Loosen a filter and click &ldquo;Apply the filters above&rdquo;, or search a wider area.</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th /><th>Suitability</th><th>Business</th><th>Where</th><th>Contact</th><th>Size</th><th>Google</th><th>Status</th></tr></thead>
              <tbody>{res.rows.map((r) => {
                const off = !!r.skip || r.added;
                return (
                  <tr key={r.key} style={off ? { opacity: 0.55 } : undefined}>
                    <td><input type="checkbox" disabled={off} checked={picked.has(r.key)} onChange={() => toggle(r.key)} aria-label={`Add ${r.name}`} /></td>
                    <td><span title={r.why.join("\n")}><Pill label={`${r.tier}${r.tier === "Skip" ? "" : ` · ${r.score}`}`} tone={TONE[r.tier] ?? "neutral"} /></span></td>
                    <td><b>{r.name}</b><div className="muted">{[r.chNumber, ...r.categories.slice(0, 2)].filter(Boolean).join(" · ")}</div><div className="row" style={{ gap: 4, marginTop: 2 }}>{r.sources.map((s) => <Pill key={s} label={s === "ch" ? "Companies House" : "Google Maps"} tone="neutral" />)}</div></td>
                    <td className="muted">{[r.city, r.postcode].filter(Boolean).join(" ") || "-"}</td>
                    <td className="muted">{r.phone ?? "-"}{r.website && <div><a href={r.website} target="_blank" rel="noreferrer">website</a></div>}{r.emails[0] && <div>{r.emails[0]}</div>}</td>
                    <td className="muted">{r.est !== null ? `≈ ${money(r.est)}` : "size unknown"}{r.employees !== null && <div>{r.employees} employee{r.employees === 1 ? "" : "s"}</div>}</td>
                    <td className="muted">{r.rating !== null ? `${r.rating} ★` : "-"}{r.reviews !== null ? ` · ${r.reviews}` : ""}{r.mapsUrl && <div><a href={r.mapsUrl} target="_blank" rel="noreferrer">map</a></div>}</td>
                    <td className="muted">{r.added ? "Added" : r.skip ?? (r.eligible === "eligible" ? `Active ${r.chType?.toUpperCase()}` : r.eligible === "not_eligible" ? `Not eligible (${r.chStatus})` : "Not matched: sole trader or trading name?")}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </section>
      )}

      <div className="card"><NicheManager niches={niches} /></div>
    </div>
  );
}
