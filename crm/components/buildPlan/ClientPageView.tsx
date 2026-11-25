import { Check, CornerDownRight, CornerUpLeft } from "lucide-react";
import type { ClientPage } from "@/lib/buildPlanPageMath";

// The Build plan's client page: what will happen, one numbered step after another, then what the team ends up with.
// It only places what buildPlanPageMath.ts hands it (the plan as saved); it writes no wording of its own beyond the headings.
// No sidebar and no controls, because it is shown to a client on a Loom or a call. Styles: app/proposals/client-page.css.
export default function ClientPageView({ page, title, brand, sender, inverse }: {
  page: ClientPage; title: string; brand: string; sender: string | null;
  /** The theme opposite to the page's, for the outcome card: Navy on a Cream page, Cream on a Navy one. */
  inverse: "light" | "dark";
}) {
  const priced = page.total !== null;
  return (
    <div className="cp">
      <header className="cp-top">
        <div className="cp-top-in">
          <span className="cp-brand">{brand}</span>
          <span className="cp-tag">Build plan</span>
        </div>
      </header>

      <main className="cp-main">
        <section className="cp-hero">
          <p className="cp-kicker">Build plan for</p>
          <h1>{title}</h1>
          {page.problem && (
            <div className="cp-problem">
              <p className="cp-kicker">The problem this solves first</p>
              <p className="cp-problem-text">{page.problem.text}</p>
              {page.problem.quote && <blockquote>You wrote: &ldquo;{page.problem.quote}&rdquo;</blockquote>}
            </div>
          )}
        </section>

        <section aria-labelledby="cp-steps-h">
          <h2 id="cp-steps-h">What happens, step by step</h2>
          <ol className="cp-steps">
            {page.steps.map((s, i) => (
              <li key={s.n} className="cp-step" style={{ "--i": i } as React.CSSProperties}>
                <span className="cp-n" aria-hidden>{s.n}</span>
                <article className="cp-card">
                  <h3><span className="cp-sr">Step {s.n}: </span>{s.title}</h3>
                  <p>{s.detail}</p>
                  {s.tools.length > 0 && <ul className="cp-chips" aria-label="Runs on">{s.tools.map((t) => <li key={t}>{t}</li>)}</ul>}
                  {s.jumps.map((j) => (
                    <p key={`${j.to}-${j.label}`} className="cp-jump">
                      {j.back ? <CornerUpLeft size={15} aria-hidden /> : <CornerDownRight size={15} aria-hidden />}
                      <span>{j.label ? <><b>{j.label}:</b> {j.back ? "goes back to" : "skips to"}</> : j.back ? "Can go back to" : "Can skip to"} step {j.to}</span>
                    </p>
                  ))}
                </article>
              </li>
            ))}
            {page.outcomes.length > 0 && (
              <li className="cp-step cp-end" style={{ "--i": page.steps.length } as React.CSSProperties}>
                <span className="cp-n" aria-hidden>{page.steps.length + 1}</span>
                <article className="cp-card cp-outcome" data-theme={inverse}>
                  <p className="cp-kicker">Outcome</p>
                  <h3>What your team ends up with</h3>
                  <ul className="cp-ticks">{page.outcomes.map((o) => <li key={o}><Check size={17} aria-hidden /><span>{o}</span></li>)}</ul>
                </article>
              </li>
            )}
          </ol>
        </section>

        {page.milestones.length > 0 && (
          <section aria-labelledby="cp-miles-h">
            <h2 id="cp-miles-h">{priced ? "Milestones, timeline and fixed price" : "Milestones and timeline"}</h2>
            <div className="cp-card cp-miles">
              <ol>
                {page.milestones.map((m, i) => (
                  <li key={i}>
                    <div className="cp-mile-main">
                      <h3>{m.name}</h3>
                      {m.delivers.length > 0 && <ul>{m.delivers.map((d) => <li key={d}>{d}</li>)}</ul>}
                    </div>
                    <div className="cp-mile-side">
                      {m.price && <b>{m.price}</b>}
                      <span>{m.when}</span>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="cp-totals">
                {page.timeline && <div><span className="cp-kicker">Timeline</span><strong>{page.timeline}</strong><span className="cp-sub">from the day I have access</span></div>}
                {page.total && <div><span className="cp-kicker">Fixed price</span><strong>{page.total}</strong><span className="cp-sub">for the milestones above</span></div>}
              </div>
            </div>
          </section>
        )}

        {(page.access.length > 0 || page.assumptions.length > 0) && (
          <section className="cp-pair">
            {page.access.length > 0 && (
              <div className="cp-card">
                <h2>What I&apos;d need from you</h2>
                <ul className="cp-list">{page.access.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            )}
            {page.assumptions.length > 0 && (
              <div className="cp-card">
                <h2>This assumes</h2>
                <ul className="cp-list">{page.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            )}
          </section>
        )}

        {page.caseStudy && (
          <section aria-labelledby="cp-case-h">
            <h2 id="cp-case-h">Where I&apos;ve done this</h2>
            <dl className="cp-card cp-case">
              <dt>Who for</dt><dd>{page.caseStudy.client_type}</dd>
              <dt>The problem</dt><dd>{page.caseStudy.problem}</dd>
              <dt>What I built</dt><dd>{page.caseStudy.built}</dd>
              {page.caseStudy.results && <><dt>Results</dt><dd>{page.caseStudy.results}</dd></>}
            </dl>
          </section>
        )}

        {page.dataNote && <p className="cp-note">{page.dataNote}</p>}
      </main>

      <footer className="cp-foot">{[sender, brand].filter(Boolean).join(" · ")}</footer>
    </div>
  );
}
