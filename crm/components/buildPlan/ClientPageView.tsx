import type { ReactNode } from "react";
import { Check, CornerDownRight, CornerUpLeft } from "lucide-react";
import type { ClientPage } from "@/lib/buildPlanPageMath";

/** How ClientPageEditor swaps a piece of text for a box to type in. `lines` is a list, one item per line. */
export type FieldOptions = { label: string; max?: number; placeholder?: string; multi?: boolean; lines?: boolean; per?: number };
export type PageEdit = { field: (key: string, o: FieldOptions) => ReactNode };

// The Build plan's client page: what will happen, one numbered step after another with its tech stack, then what the team ends up with.
// It only places what buildPlanPageMath.ts hands it (the plan as saved and the owner's own words for the page).
// Shown to a client on a Loom or a call, so the page itself has no sidebar and no controls; with `edit` (ClientPageEditor) every
// piece of text becomes a box to type in, laid out exactly as it will be shown. Styles: app/proposals/client-page.css.
export default function ClientPageView({ page, title, brand, sender, inverse, fontClass = "", edit, top }: {
  page: ClientPage; title: string; brand: string; sender: string | null;
  /** The theme opposite to the page's, for the outcome card: Navy on a Cream page, Cream on a Navy one. */
  inverse: "light" | "dark";
  fontClass?: string; edit?: PageEdit; top?: ReactNode;
}) {
  const priced = page.total !== null;
  const T = (key: string, value: string, o: FieldOptions) => (edit ? edit.field(key, o) : value);
  const list = (key: string, items: string[], o: FieldOptions, className?: string) =>
    edit ? edit.field(key, { ...o, multi: true, lines: true }) : items.length > 0 ? <ul className={className}>{items.map((a) => <li key={a}>{a}</li>)}</ul> : null;
  return (
    <div className={`cp ${fontClass}${edit ? " cp-editing" : ""}`}>
      {top}
      <header className="cp-top">
        <div className="cp-top-in">
          <span className="cp-brand">{brand}</span>
          <span className="cp-tag">Build plan</span>
        </div>
      </header>

      <main className="cp-main">
        <section className="cp-hero">
          {edit
            ? <p className="cp-kicker cp-for"><span>Prepared for</span>{edit.field("client", { label: "Who the page is for", placeholder: "their business name (optional)", max: 80 })}</p>
            : <p className="cp-kicker">{page.client ? `Prepared for ${page.client}` : "Build plan for"}</p>}
          <h1>{T("title", title, { label: "Page title", max: 120, multi: true, per: 26 })}</h1>
          {(edit || page.intro) && <p className="cp-intro">{T("intro", page.intro ?? "", { label: "Opening line", placeholder: "An opening line written for this business (optional)", max: 400, multi: true, per: 70 })}</p>}
          {page.problem && (
            <div className="cp-problem">
              <p className="cp-kicker">The problem this solves first</p>
              <p className="cp-problem-text">{T("problem", page.problem.text, { label: "The problem, in your words", max: 200, multi: true, per: 34 })}</p>
              {page.problem.quote && <blockquote>You wrote: &ldquo;{page.problem.quote}&rdquo;</blockquote>}
              {edit && page.problem.quote && <p className="cp-hint">The quote is the job post&apos;s own words, so it is not edited here.</p>}
            </div>
          )}
        </section>

        <section aria-labelledby="cp-steps-h">
          <h2 id="cp-steps-h">What happens, step by step</h2>
          {edit && <p className="cp-hint cp-hint-top">Reword any step and list everything it needs under Tech stack, separated by commas. To add or remove a step, or change the hours behind the prices, use step 4 on the Build plan tab.</p>}
          <ol className="cp-steps">
            {page.steps.map((s, i) => (
              <li key={s.n} className="cp-step" style={{ "--i": i } as React.CSSProperties}>
                <span className="cp-n" aria-hidden>{s.n}</span>
                <article className="cp-card">
                  <h3><span className="cp-sr">Step {s.n}: </span>{T(`step.${i}.title`, s.title, { label: `Step ${s.n} title`, max: 40 })}</h3>
                  <p>{T(`step.${i}.detail`, s.detail, { label: `Step ${s.n}: what happens`, max: 260, multi: true, per: 78 })}</p>
                  {(edit || s.stack.length > 0) && (
                    <div className="cp-stack">
                      <span className="cp-kicker">Tech stack</span>
                      {edit ? edit.field(`step.${i}.stack`, { label: `Step ${s.n} tech stack`, placeholder: "Every tool this step needs, separated by commas", max: 200 })
                        : <ul className="cp-chips">{s.stack.map((t) => <li key={t}>{t}</li>)}</ul>}
                    </div>
                  )}
                  {s.jumps.map((j) => (
                    <p key={`${j.to}-${j.label}`} className="cp-jump">
                      {j.back ? <CornerUpLeft size={15} aria-hidden /> : <CornerDownRight size={15} aria-hidden />}
                      <span>{j.label ? <><b>{j.label}:</b> {j.back ? "goes back to" : "skips to"}</> : j.back ? "Can go back to" : "Can skip to"} step {j.to}</span>
                    </p>
                  ))}
                </article>
              </li>
            ))}
            {(edit || page.outcomes.length > 0) && (
              <li className="cp-step cp-end" style={{ "--i": page.steps.length } as React.CSSProperties}>
                <span className="cp-n" aria-hidden>{page.steps.length + 1}</span>
                <article className="cp-card cp-outcome" data-theme={inverse}>
                  <p className="cp-kicker">Outcome</p>
                  <h3>What your team ends up with</h3>
                  {edit ? edit.field("outcomes", { label: "What the team ends up with, one per line", placeholder: "One per line", multi: true, lines: true, per: 70 })
                    : <ul className="cp-ticks">{page.outcomes.map((o) => <li key={o}><Check size={17} aria-hidden /><span>{o}</span></li>)}</ul>}
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
                      <h3>{T(`mile.${i}.name`, m.name, { label: `Milestone ${i + 1} name`, max: 80 })}</h3>
                      {list(`mile.${i}.delivers`, m.delivers, { label: `Milestone ${i + 1}: what they get, one per line`, placeholder: "What they get, one per line", per: 60 })}
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

        {(edit || page.access.length > 0 || page.assumptions.length > 0) && (
          <section className="cp-pair">
            {(edit || page.access.length > 0) && (
              <div className="cp-card">
                <h2>What I&apos;d need from you</h2>
                {list("access", page.access, { label: "What you would need from them, one per line", placeholder: "One per line", per: 42 }, "cp-list")}
              </div>
            )}
            {(edit || page.assumptions.length > 0) && (
              <div className="cp-card">
                <h2>This assumes</h2>
                {list("assumptions", page.assumptions, { label: "What this assumes, one per line", placeholder: "One per line", per: 42 }, "cp-list")}
              </div>
            )}
          </section>
        )}

        {page.caseStudy && (
          <section aria-labelledby="cp-case-h">
            <h2 id="cp-case-h">Where I&apos;ve done this</h2>
            {edit && <p className="cp-hint cp-hint-top">Placed word for word from Proof and answers. Swap or remove it in step 3 on the Build plan tab.</p>}
            <dl className="cp-card cp-case">
              <dt>Who for</dt><dd>{page.caseStudy.client_type}</dd>
              <dt>The problem</dt><dd>{page.caseStudy.problem}</dd>
              <dt>What I built</dt><dd>{page.caseStudy.built}</dd>
              {page.caseStudy.results && <><dt>Results</dt><dd>{page.caseStudy.results}</dd></>}
            </dl>
          </section>
        )}

        {(edit || page.closing) && (
          <section className="cp-closing">
            <p className="cp-kicker">Next step</p>
            <p className="cp-closing-text">{T("closing", page.closing ?? "", { label: "Closing line", placeholder: "What happens next, in a line or two (optional)", max: 300, multi: true, per: 50 })}</p>
          </section>
        )}

        {page.dataNote && <p className="cp-note">{page.dataNote}</p>}
      </main>

      <footer className="cp-foot">{[sender, brand].filter(Boolean).join(" · ")}</footer>
    </div>
  );
}
