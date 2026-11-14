"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { changeNicheStatusAction, saveNicheDetailsAction } from "@/lib/nicheScreenActions";
import { CHANNEL_LABEL, CHANNELS, MAX_ACTIVE, NICHE_PLATFORMS, STATUS_LABEL, STATUS_MEANING, STATUSES, type NicheStatus } from "@/lib/nicheStatus";
import { CLIENTS_TO_UNLOCK, OFFER_MAX, OVERRIDE_REASON_MAX, OVERRIDE_REASON_MIN, PROMISE_MAX } from "@/lib/nicheChange";
import type { NicheCard, NicheChange } from "@/lib/nicheScreen";
import { activityLabel } from "./activity";
import { useToast } from "./Toast";

// The Niches screen (docs/NICHE_FOCUS_PLAN.md, N3): one card per niche. The server decides every change (nicheScreenActions.ts);
// this only shows the cards and asks for a reason and the password when the server says an early unlock needs them.

const TONE: Record<NicheStatus, string> = { active: "good", seeding: "warn", audience: "neutral", parked: "neutral" };
const PLATFORM_LABEL: Record<string, string> = { linkedin: "LinkedIn", instagram: "Instagram", tiktok: "TikTok" };
const when = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function NicheBoard({ cards, problems, recent }: { cards: NicheCard[]; problems: string[]; recent: NicheChange[] }) {
  const live = cards.filter((c) => c.status !== "parked"), parked = cards.filter((c) => c.status === "parked");
  const active = cards.filter((c) => c.status === "active").length;
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        {active} of {MAX_ACTIVE} active. Another niche becomes active once an active one has {CLIENTS_TO_UNLOCK} paying clients (deals Won with a monthly value);
        before that it needs your password and a reason. Moving a niche to seeding, audience or parked only tightens, so it needs neither.
        Every niche still sits on top of the usual checks: only verified active limited companies that have not opted out are ever contacted.
      </p>
      {problems.length > 0 && (
        <div className="card" role="status" style={{ borderColor: "var(--warn)" }}>
          <div className="field-label">Worth fixing</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      <div className="niche-grid">{live.map((c) => <NicheCardView key={c.key} n={c} />)}</div>
      {parked.length > 0 && (
        <details>
          <summary>Parked niches ({parked.length})</summary>
          <div className="niche-grid" style={{ marginTop: 12 }}>{parked.map((c) => <NicheCardView key={c.key} n={c} />)}</div>
        </details>
      )}
      <section className="card">
        <h2>Recent niche changes</h2>
        {recent.length === 0 ? <p className="muted" style={{ margin: 0 }}>No changes yet. Status, offer and channel changes are listed here and in Activity.</p> : (
          <ul className="niche-log">
            {recent.map((r) => <li key={r.id}><span className="muted">{when(r.occurred_at)}</span> <b>{activityLabel(r.type)}</b> {r.body}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

function NicheCardView({ n }: { n: NicheCard }) {
  const router = useRouter(), toast = useToast();
  const [to, setTo] = useState<NicheStatus>(n.status);
  const [unlock, setUnlock] = useState<string | null>(null);   // the server's reason an override is needed
  const [reason, setReason] = useState(""), [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = `niche-${n.key}`;

  function change(override?: { reason: string; password: string }) {
    setError(null);
    start(async () => {
      const r = await changeNicheStatusAction(n.key, to, override);
      if (r.needsOverride) { setUnlock(r.needsOverride); return; }
      if (r.error) { setError(r.error); setPassword(""); return; }
      toast(r.ok ?? "Saved"); setUnlock(null); setReason(""); setPassword(""); router.refresh();
    });
  }

  return (
    <article className="card niche-card" id={id}>
      <div className="row-between">
        <h3 style={{ margin: 0 }}>{n.label}</h3>
        <span className="row" style={{ gap: 6 }}>
          {n.tier && <span className="badge tone-neutral">{n.tier} tier</span>}
          <span className={`badge tone-${TONE[n.status]}`}>{STATUS_LABEL[n.status]}</span>
        </span>
      </div>
      <p className="muted" style={{ margin: 0 }}>{STATUS_MEANING[n.status]}{n.custom ? " Added in the CRM." : ""}</p>
      <dl className="niche-facts">
        <dt>Promise</dt><dd>{n.promise || <span className="muted">None yet</span>}</dd>
        <dt>Offer</dt><dd>{n.offer || <span className="muted">None yet</span>}</dd>
        <dt>Channels</dt><dd>{n.channels.length ? n.channels.map((c) => CHANNEL_LABEL[c].replace(/^./, (x) => x.toUpperCase())).join(", ") : <span className="muted">None</span>}</dd>
        <dt>Platforms</dt><dd>{n.platforms.length ? n.platforms.map((p) => PLATFORM_LABEL[p]).join(", ") : <span className="muted">None</span>}</dd>
      </dl>
      <div className="niche-counts">
        <div><b>{n.counts.companies}</b><span>Companies</span></div>
        <div><b>{n.counts.touches}</b><span>Touches</span></div>
        <div><b>{n.counts.calls}</b><span>Calls booked</span></div>
        <div><b>{n.counts.clients}</b><span>Paying clients</span></div>
      </div>
      {n.override && (
        <p className="niche-override"><KeyRound size={14} aria-hidden /> Unlocked early with your password on {when(n.override.at)}: &ldquo;{n.override.reason}&rdquo;</p>
      )}

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <label className="sr-only" htmlFor={`${id}-status`}>Status for {n.label}</label>
        <select id={`${id}-status`} value={to} disabled={pending} onChange={(e) => { setTo(e.target.value as NicheStatus); setUnlock(null); setError(null); }}>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button type="button" className="secondary" disabled={pending || to === n.status} onClick={() => change()}>{pending && !unlock ? "Saving…" : "Change status"}</button>
      </div>
      {unlock && (
        <div className="niche-unlock stack" style={{ gap: 10 }}>
          <p style={{ margin: 0 }}>{unlock}</p>
          <label className="stack" style={{ gap: 4 }}>
            <span className="field-label">Why now ({OVERRIDE_REASON_MIN} to {OVERRIDE_REASON_MAX} characters)</span>
            <textarea rows={2} maxLength={OVERRIDE_REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="field-label">Your CRM password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && password) change({ reason, password }); }} />
          </label>
          <span className="row" style={{ gap: 8 }}>
            <button type="button" className="secondary" disabled={pending || !password} onClick={() => change({ reason, password })}>{pending ? "Checking…" : `Make ${n.label} active`}</button>
            <button type="button" className="link" disabled={pending} onClick={() => { setUnlock(null); setPassword(""); setTo(n.status); }}>Cancel</button>
          </span>
        </div>
      )}
      {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <DetailsEditor n={n} />
    </article>
  );
}

function DetailsEditor({ n }: { n: NicheCard }) {
  const router = useRouter(), toast = useToast();
  const [promise, setPromise] = useState(n.promise), [offer, setOffer] = useState(n.offer);
  const [channels, setChannels] = useState<string[]>(n.channels), [platforms, setPlatforms] = useState<string[]>(n.platforms);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lists = n.status !== "parked";
  const flip = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  function save() {
    setError(null);
    start(async () => {
      const r = await saveNicheDetailsAction(n.key, { promise, offer, ...(lists ? { channels, platforms } : {}) });
      if (r.error) { setError(r.error); return; }
      toast(r.ok ?? "Saved"); router.refresh();
    });
  }
  return (
    <details>
      <summary>Edit promise, offer and channels</summary>
      <div className="stack" style={{ gap: 10, marginTop: 10 }}>
        <label className="stack" style={{ gap: 4 }}>
          <span className="field-label">Promise: one plain sentence a stranger would repeat, no figures</span>
          <textarea rows={2} maxLength={PROMISE_MAX} value={promise} onChange={(e) => setPromise(e.target.value)} />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span className="field-label">Offer</span>
          <input maxLength={OFFER_MAX} value={offer} onChange={(e) => setOffer(e.target.value)} />
        </label>
        {lists ? (
          <>
            <fieldset className="niche-ticks"><legend className="field-label">Outreach channels{n.status === "seeding" ? " (seeding uses LinkedIn only)" : ""}</legend>
              {CHANNELS.map((c) => <label key={c}><input type="checkbox" checked={channels.includes(c)} onChange={() => setChannels(flip(channels, c))} /> {CHANNEL_LABEL[c]}</label>)}
            </fieldset>
            <fieldset className="niche-ticks"><legend className="field-label">Content platforms</legend>
              {NICHE_PLATFORMS.map((p) => <label key={p}><input type="checkbox" checked={platforms.includes(p)} onChange={() => setPlatforms(flip(platforms, p))} /> {PLATFORM_LABEL[p]}</label>)}
            </fieldset>
          </>
        ) : <p className="muted" style={{ margin: 0 }}>A parked niche has no channels or platforms. Change its status first to choose them.</p>}
        <button type="button" className="secondary" style={{ alignSelf: "flex-start" }} disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
        {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
        <p className="muted" style={{ margin: 0 }}>{n.custom ? "Saved in the CRM's database." : "Saved into config/niches.yaml (the previous file is kept as niches.yaml.bak)."} Changing the offer or promise is logged, and from then on the stop rule counts touches afresh.</p>
      </div>
    </details>
  );
}
