"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Mail, Phone, Plus, Search, Star } from "lucide-react";
import { sourcerAddAction, sourcerPollAction, sourcerResultsAction, startSourcerAction, type SourcerPoll, type SourcerResults, type StartState } from "@/lib/sourcerActions";
import type { Budget } from "@/lib/launch";
import type { NicheOption } from "@/lib/leadConfig";
import { OPTIONS, money, type SourcerFilters } from "@/lib/sourcerFilters";
import { deleteSavedSearchAction, saveSearchAction, type SavedSearch } from "@/lib/savedSearchActions";
import NicheManager from "./NicheManager";
import ScoreBar from "./ScoreBar";
import { useToast } from "./Toast";

const usd = (n: number) => `$${n.toFixed(n < 0.1 ? 3 : 2)}`;
const FILTER_FIELDS = new Set(["revMin", "revMax", "empMin", "empMax", "ageMin", "website", "rating", "reviewsMin", "includeUnknown", "types"]);

const Range = ({ name, label, options, fmt }: { name: string; label: string; options: number[]; fmt: (n: number) => string }) => (
  <label className="sx-field">{label}<select name={name} defaultValue=""><option value="">Any</option>{options.map((o) => <option key={o} value={o}>{fmt(o)}</option>)}</select></label>
);

// Search every source at once, narrow the results, and add the businesses you want. The brief stays on the left while you read the ledger on the right.
export default function SourcerPanel({ niches, budget, latestRunId, saved }: { niches: NicheOption[]; budget: Budget; latestRunId: number | null; saved: SavedSearch[] }) {
  const router = useRouter(), toast = useToast();
  const form = useRef<HTMLFormElement>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [start, action, pending] = useActionState<StartState, FormData>(startSourcerAction, null);
  const [runId, setRunId] = useState<number | null>(null);
  const [shown, setShown] = useState<number | null>(latestRunId);
  const [poll, setPoll] = useState<SourcerPoll | null>(null);
  const [res, setRes] = useState<SourcerResults | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();
  const [maps, setMaps] = useState(false), [contacts, setContacts] = useState(true), [limit, setLimit] = useState(50);
  const [nicheKey, setNicheKey] = useState(""), [term, setTerm] = useState("");
  const [savedId, setSavedId] = useState(""), [saveName, setSaveName] = useState(""), [saving, startSave] = useTransition();
  const [loc, setLoc] = useState(""), [editing, setEditing] = useState(false), [searched, setSearched] = useState(false);
  const terms = niches.find((n) => n.key === nicheKey)?.terms ?? [];

  const load = async (id: number, override?: Record<string, string>, keepPicks = false) => {
    const r = await sourcerResultsAction(id, override);
    setRes(r);
    setPicked((prev) => new Set((r?.rows ?? []).filter((x) => !x.skip && !x.added && (keepPicks ? prev.has(x.key) : x.eligible === "eligible")).map((x) => x.key)));
  };
  useEffect(() => { if (shown) void load(shown); }, [shown]);
  useEffect(() => { if (start?.id) { setRunId(start.id); setShown(null); setRes(null); setNote(null); setEditing(false); setSearched(true); } }, [start]);
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

  /** Changing a filter re-ranks the results you already have (free). The niche, area and sources belong to the search itself. */
  const onBrief = (e: React.FormEvent<HTMLFormElement>) => {
    const name = (e.target as HTMLInputElement).name;
    if (!shown || !FILTER_FIELDS.has(name) || !form.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { const o: Record<string, string> = {}; new FormData(form.current!).forEach((v, k) => { if (typeof v === "string") o[k] = v; }); void load(shown, o, true); }, 350);
  };

  /** Submitting through onSubmit instead of action={...} stops React clearing the filter fields after a search, so they keep showing what the results were filtered by. */
  const submit = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const data = new FormData(e.currentTarget); startTransition(() => action(data)); };
  /** Fills the form from a saved search. It never starts a search, so a paid source still needs your click. */
  const loadSaved = (f: SourcerFilters) => {
    const el = form.current;
    if (!el) return;
    setNicheKey(niches.some((n) => n.key === f.niche) ? f.niche : ""); setLoc(f.location); setTerm(f.term ?? "");
    setMaps(f.sources.includes("maps") && budget.configured); setContacts(f.contacts); setLimit(OPTIONS.limit.includes(f.limit) ? f.limit : 50); setEditing(true);
    const set = (name: string, v: string) => { const x = el.elements.namedItem(name); if (x && "value" in x) (x as HTMLInputElement | RadioNodeList).value = v; };
    const str = (n: number | null) => (n === null ? "" : String(n));
    set("revMin", str(f.revMin)); set("revMax", str(f.revMax)); set("empMin", str(f.empMin)); set("empMax", str(f.empMax)); set("ageMin", str(f.ageMin));
    set("reviewsMin", str(f.reviewsMin)); set("website", f.website); set("rating", f.rating); set("types", f.types);
    const cb = (name: string, on: boolean) => { const x = el.elements.namedItem(name) as HTMLInputElement | null; if (x) x.checked = on; };
    cb("src_ch", f.sources.includes("ch")); cb("includeUnknown", f.includeUnknown);
  };
  const saveCurrent = () => startSave(async () => {
    if (!form.current) return;
    const r = await saveSearchAction(saveName, new FormData(form.current));
    if (r.error) { toast(r.error, "bad"); return; }
    toast(r.ok ?? "Saved"); setSaveName(""); router.refresh();
  });
  const removeSaved = () => startSave(async () => {
    if (!savedId) return;
    await deleteSavedSearchAction(Number(savedId)); setSavedId(""); toast("Deleted"); router.refresh();
  });
  const chosenSaved = saved.find((s) => String(s.id) === savedId);

  const places = Math.min(50, limit), each = contacts ? budget.perPlace.withContacts : budget.perPlace.without, fit = Math.min(places, budget.maxPlacesNow), est = maps ? fit * each : 0;
  const busy = pending || !!runId;
  // After a search you run here the "what and where" sections fold into a summary, so the panel's space goes to the filters you'll be adjusting.
  const collapsed = searched && !!res && !!shown && !editing && nicheKey !== "" && loc.trim() !== "";
  const nicheLabel = niches.find((n) => n.key === nicheKey)?.label ?? nicheKey;
  const available = (res?.rows ?? []).filter((r) => !r.skip && !r.added);
  const toggle = (k: string) => setPicked((p) => { const q = new Set(p); q.has(k) ? q.delete(k) : q.add(k); return q; });
  const add = () => startAdd(async () => {
    if (!shown) return;
    const r = await sourcerAddAction(shown, [...picked]);
    if (r.error) { toast(r.error, "bad"); return; }
    setNote(r.ok ?? null); toast("Added to the CRM"); await load(shown); router.refresh();
  });
  const usedPct = Math.min(100, (budget.dailyUsed / Math.max(budget.dailyCap, 0.0001)) * 100), estPct = Math.min(100 - usedPct, (est / Math.max(budget.dailyCap, 0.0001)) * 100);

  return (
    <>
      <div className="sx-bench">
        <aside className="sx-rail" aria-label="Search brief">
          <form ref={form} onSubmit={submit} onChange={onBrief}>
            {saved.length > 0 && (
              <section className="sx-sec">
                <h2>Saved searches</h2>

                  <label className="sx-field">Reuse a search
                    <select aria-label="Saved searches" value={savedId} onChange={(e) => setSavedId(e.target.value)}><option value="">Choose one</option>{saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                  <div className="row" style={{ gap: 10 }}>
                    <button type="button" className="secondary" disabled={!chosenSaved} onClick={() => chosenSaved && loadSaved(chosenSaved.filters)}>Load</button>
                    <button type="button" className="link" disabled={!savedId || saving} onClick={removeSaved}>Delete</button>
                  </div>
                  <p className="sx-hint">Loading only fills in the form. Nothing runs until you click Search.</p>
                
              </section>
            )}
            {collapsed && (
              <section className="sx-sec">
                <h2>This search</h2>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}><b>{nicheLabel}</b> in <b>{loc}</b></p>
                <p className="sx-hint">{res?.filters.sources.map((x) => (x === "ch" ? "Companies House" : "Google Maps")).join(" and ")}, up to {res?.filters.limit}</p>
                <button type="button" className="secondary" onClick={() => setEditing(true)}>Change search</button>
              </section>
            )}
            <section className="sx-sec" hidden={collapsed}>
              <h2>What to look for</h2>
              <label className="sx-field">Niche
                <select name="niche" required value={nicheKey} onChange={(e) => setNicheKey(e.target.value)}><option value="" disabled>Choose a niche</option>{niches.map((n) => <option key={n.key} value={n.key}>{n.label}{n.custom ? " (yours)" : ""}</option>)}</select></label>
              <label className="sx-field">Town or area<input name="location" placeholder="Leeds" maxLength={60} required value={loc} onChange={(e) => setLoc(e.target.value)} /></label>
              <div className="sx-choice" role="radiogroup" aria-label="Company types">
                <label><input type="radio" name="types" value="limited" defaultChecked />Limited companies only</label>
                <label><input type="radio" name="types" value="all" />Include sole traders</label>
              </div>
              <p className="sx-hint">Sole traders can&apos;t be contacted, so they&apos;re for research only.</p>
              {searched && res && editing && <button type="button" className="link" style={{ alignSelf: "flex-start" }} onClick={() => setEditing(false)}>Keep this search</button>}
            </section>

            <section className="sx-sec" hidden={collapsed}>
              <h2>Where to look</h2>
              <div className="sx-source">
                <label><input type="checkbox" name="src_ch" defaultChecked /><span><strong>Companies House</strong><span className="sx-hint">Active limited companies by industry code, with filing health and size.</span></span><span className="sx-cost free">Free</span></label>
              </div>
              <div className="sx-source">
                <label><input type="checkbox" name="src_maps" checked={maps} onChange={(e) => setMaps(e.target.checked)} disabled={!budget.configured} /><span><strong>Google Maps</strong><span className="sx-hint">Phone, website, rating, reviews and generic emails.</span></span><span className="sx-cost paid">Credits</span></label>
                {!budget.configured && <p className="sx-hint" style={{ paddingLeft: 26 }}>Add <code>APIFY_TOKEN</code> to switch this on.</p>}
                {maps && (
                  <div className="sx-sub">
                    <label className="sx-field">What to search for<input name="term" list="sx-terms" placeholder={terms[0] ?? "roofer"} maxLength={80} value={term} onChange={(e) => setTerm(e.target.value)} /><datalist id="sx-terms">{terms.map((t) => <option key={t} value={t} />)}</datalist></label>
                    <label className="row" style={{ gap: 8, fontSize: 13.5, color: "var(--text-2)" }}><input type="checkbox" name="contacts" checked={contacts} onChange={(e) => setContacts(e.target.checked)} />Look on their website for emails and social pages (+{usd(budget.perPlace.withContacts - budget.perPlace.without)} a place)</label>
                    <div className="sx-meter">
                      <div className="sx-track" role="img" aria-label={`${usd(budget.dailyUsed)} of ${usd(budget.dailyCap)} used today`}><i className="used" style={{ width: `${usedPct}%` }} /><i className="est" style={{ width: `${estPct}%` }} /></div>
                      <span className="sx-hint">{budget.maxPlacesNow < 1 ? (budget.blocked ?? "Today's budget is used up.") : <>This search: about <b>{usd(est)}</b> for {fit} place{fit === 1 ? "" : "s"}{fit < places ? ` (cut from ${places} to fit today's budget)` : ""}. Today so far {usd(budget.dailyUsed)} of {usd(budget.dailyCap)}.</>}</span>
                    </div>
                  </div>
                )}
              </div>
              <label className="sx-field">How many to look at<select name="limit" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>{OPTIONS.limit.map((n) => <option key={n}>{n}</option>)}</select></label>
            </section>

            <section className="sx-sec">
              <h2>Narrow it down</h2>
              <div className="sx-pair"><Range name="revMin" label="Revenue from" options={OPTIONS.revMin} fmt={money} /><Range name="revMax" label="up to" options={OPTIONS.revMax} fmt={money} /></div>
              <div className="sx-pair"><Range name="empMin" label="Employees from" options={OPTIONS.empMin} fmt={(n) => `${n}`} /><Range name="empMax" label="up to" options={OPTIONS.empMax} fmt={(n) => `${n}`} /></div>
              <div className="sx-pair"><Range name="ageMin" label="Trading for" options={OPTIONS.ageMin} fmt={(n) => `${n}+ years`} /><Range name="reviewsMin" label="Google reviews" options={OPTIONS.reviewsMin} fmt={(n) => `${n}+`} /></div>
              <div className="sx-pair">
                <label className="sx-field">Website<select name="website" defaultValue="any"><option value="any">Any</option><option value="has">Has one</option><option value="none">None</option></select></label>
                <label className="sx-field">Google rating<select name="rating" defaultValue="any"><option value="any">Any</option><option value="45">4.5 or more</option><option value="4">4.0 or more</option><option value="lt4">Under 4.0</option></select></label>
              </div>
              <label className="row" style={{ gap: 8, alignItems: "flex-start", fontSize: 13.5, color: "var(--text-2)" }}><input type="checkbox" name="includeUnknown" defaultChecked style={{ marginTop: 3 }} /><span>Keep businesses where a detail isn&apos;t known. Companies House only holds real turnover for some companies.</span></label>
              <p className="sx-hint">{shown ? "Changing these re-ranks the results straight away." : "Once you have results, changing these re-ranks them straight away."}</p>
            </section>

            <section className="sx-sec">
              <h2>Save for later</h2>
              <label className="sx-field">Save the current choices as
                <input aria-label="Name for this search" placeholder="Leave blank to name it after the niche and area" maxLength={80} value={saveName} onChange={(e) => setSaveName(e.target.value)} /></label>
              <button type="button" className="secondary" disabled={saving || nicheKey === "" || loc.trim() === ""} onClick={saveCurrent}>{saving ? "Saving…" : "Save this search"}</button>
            </section>

            <div className="sx-go">
              <button disabled={busy}><Search size={16} aria-hidden /> {busy ? "Searching…" : "Search"}</button>
              <p className="sx-hint">{maps ? "Google Maps uses credits, shown above." : "Free. Nothing is added until you choose."}</p>
              {start?.error && <p className="error" role="alert" style={{ margin: 0, fontSize: 14 }}>{start.error}</p>}
              {start?.notes?.map((n) => <p key={n} role="status" className="sx-hint" style={{ color: "var(--warn)" }}>{n}</p>)}
            </div>
          </form>
        </aside>

        <section className="sx-main" aria-live="polite">
          {poll && (runId || poll.status === "failed") && (
            <div className="sx-progress" role="status">
              {poll.parts.map((p) => <div key={p.key} className="row"><span className={`sx-dot ${p.state === "done" ? "done" : p.state === "failed" ? "failed" : "run"}`} /><b>{p.label}</b><span className={p.state === "failed" ? "error" : "muted"}>{p.message}</span></div>)}
            </div>
          )}

          {res && shown ? (
            <>
              <div className="sx-resulthead">
                <h2 className="sx-count">{available.length} new business{available.length === 1 ? "" : "es"}<small>{res.found} found, {res.found - res.rows.length} hidden by your filters{res.mapsCostUsd !== null || res.mapsEstUsd !== null ? `. Google Maps cost ${res.mapsCostUsd !== null ? usd(res.mapsCostUsd) : `about ${usd(res.mapsEstUsd ?? 0)}`}.` : "."}</small></h2>
                {available.length > 0 && (
                  <span className="row" style={{ gap: 10 }}>
                    <button type="button" className="link" onClick={() => setPicked(new Set(available.map((r) => r.key)))}>Select all</button>
                    <button type="button" className="link" onClick={() => setPicked(new Set())}>None</button>
                    <button type="button" disabled={adding || picked.size === 0} onClick={add}><Plus size={16} aria-hidden /> {adding ? "Adding…" : `Add ${picked.size} to the CRM`}</button>
                  </span>
                )}
              </div>
              {note && <p role="status" className="muted" style={{ margin: 0 }}>{note}</p>}
              {res.warnings.map((w) => <p key={w} className="sx-hint" style={{ color: "var(--warn)" }}>{w}</p>)}
              {res.dropped.length > 0 && <details><summary className="muted">What the filters hid</summary><ul style={{ marginTop: 6 }}>{res.dropped.map(([why, n]) => <li key={why} className="muted" style={{ border: 0, padding: "2px 0" }}>{n} {why}</li>)}</ul></details>}
              <div className="sx-legend" aria-label="What the score bar shows">
                <span><i className="i-size" />Size and filing health</span><span><i className="i-verified" />Verified company</span><span><i className="i-reach" />Reachable</span><span><i className="i-rep" />Reputation</span>
              </div>
              {res.rows.length === 0 ? (
                <div className="sx-empty"><h2>Nothing matches these filters</h2><p>Loosen a filter on the left to bring businesses back, or search a wider area.</p></div>
              ) : (
                <ul className="sx-ledger">
                  {res.rows.map((r, i) => {
                    const off = !!r.skip || r.added;
                    return (
                      <li key={r.key}>
                        <div className={`sx-row${off ? " off" : ""}`}>
                          <input type="checkbox" disabled={off} checked={picked.has(r.key)} onChange={() => toggle(r.key)} aria-label={`Add ${r.name}`} />
                          <ScoreBar parts={r.parts} score={r.score} tier={r.tier} why={r.why} n={i} />
                          <div className="sx-detail">
                          <div className="sx-biz">
                            <b>{r.name}</b>
                            <span>{[r.chNumber, ...r.categories.slice(0, 2), [r.city, r.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "No further details"}</span>
                            <span className="sx-status">{r.added ? "Added" : r.skip ?? (r.eligible === "eligible" ? `Active ${r.chType?.toUpperCase() ?? "company"}, verified` : r.eligible === "not_eligible" ? `Not eligible: ${r.chStatus ?? "status unknown"}` : "Not matched to a limited company")}{r.sources.length > 1 ? ". Found in both sources" : r.sources[0] === "maps" ? ". Google Maps" : ". Companies House"}</span>
                          </div>
                          <div className="sx-figs">
                          <div className="sx-reach" aria-label="How to reach them">
                            {r.phone ? <a className="on" href={`tel:${r.phone.replace(/\s/g, "")}`} title={r.phone} aria-label={`Phone ${r.phone}`}><Phone size={17} /></a> : <span className="off" title="No phone found"><Phone size={17} /></span>}
                            {r.website ? <a className="on" href={r.website} target="_blank" rel="noreferrer" title={r.website} aria-label="Website"><Globe size={17} /></a> : <span className="off" title="No website found"><Globe size={17} /></span>}
                            {r.emails[0] ? <a className="on" href={`mailto:${r.emails[0]}`} title={r.emails[0]} aria-label={`Email ${r.emails[0]}`}><Mail size={17} /></a> : <span className="off" title="No generic email found"><Mail size={17} /></span>}
                          </div>
                          <div className="sx-fig">{r.est !== null ? <b>≈ {money(r.est)}</b> : <b className="dim">–</b>}<span>{r.employees !== null ? `${r.employees} employee${r.employees === 1 ? "" : "s"}` : r.est !== null ? "estimated revenue" : "size unknown"}</span></div>
                          <div className="sx-fig">{r.rating !== null ? <b style={{ display: "flex", alignItems: "center", gap: 4 }}><Star size={14} aria-hidden fill="currentColor" />{r.rating}</b> : <b className="dim">–</b>}<span>{r.reviews !== null ? `${r.reviews} reviews` : "no Google data"}{r.mapsUrl && <> <a href={r.mapsUrl} target="_blank" rel="noreferrer">map</a></>}</span></div>
                          </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : !poll || (!runId && poll.status !== "failed") ? (
            <div className="sx-empty">
              <h2>Pick a niche and an area</h2>
              <p>Companies House is free and checks every company&apos;s filing health. Google Maps adds phone numbers, websites and reviews, and shows what it will cost before you spend anything. Results appear here, best first, with a bar showing why each one ranks where it does.</p>
            </div>
          ) : null}
        </section>
      </div>
      <div className="card" style={{ marginTop: 24 }}><NicheManager niches={niches} /></div>
    </>
  );
}
