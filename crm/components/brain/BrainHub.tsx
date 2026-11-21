import Link from "next/link";
import { BRAIN_LOBES, BRAIN_STEM } from "@/lib/brainLobes";
import { TRACES, SPARKS } from "@/lib/brainArt";
import type { KnowledgeTopic } from "@/lib/knowledge";
import BrainCore from "./BrainCore";
import BrainMotion from "./BrainMotion";
import LobeCount from "./LobeCount";
import "./brain.css";

// The dashboard brain: the CRM as four lobes around the knowledge-base assistant.
// Everything here is server-rendered HTML and CSS, so it works with JavaScript off: each lobe is a real link to its main
// page, its pull-out preview opens on hover and on keyboard focus (CSS :hover / :focus-within), and the core is a link to
// /assistant. With JavaScript, BrainMotion adds the GSAP motion and tap-to-preview on touch screens, and BrainCore opens
// the assistant in a panel instead of a new page. The art is public/brain/brain.webp (Higgsfield, from the owner's
// reference, cut to a transparent background), and its traces and coral nodes are measured in lib/brainArt.ts.
export default function BrainHub({ topics }: { topics: KnowledgeTopic[] }) {
  return (
    <section className="brain" aria-labelledby="brain-h" data-brain>
      <h2 id="brain-h" className="brain-title">Your business, four lobes</h2>
      <div className="brain-frame">
        <div className="brain-art" aria-hidden>
          <div className="brain-aura" />
          {/* A plain img: a fixed decorative asset, already sized and compressed, so next/image would add nothing. */}
          <img className="brain-img" src="/brain/brain.webp" alt="" width={960} height={960} decoding="async" fetchPriority="high" />
          <svg className="brain-synapses" viewBox="0 0 100 100" focusable="false">
            <defs>
              <filter id="brain-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="0.6" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <g filter="url(#brain-glow)">
              {TRACES.map((t) => (
                <path key={t.key} className="brain-pulse" data-trace={t.key} d={t.d} strokeDasharray={`4 ${t.length + 8}`} strokeDashoffset={4} />
              ))}
              {SPARKS.map((s, i) => <circle key={i} className="brain-spark" data-lobe={s.lobe} cx={s.x} cy={s.y} r={1.3} />)}
            </g>
          </svg>
        </div>

        {BRAIN_LOBES.map((lobe) => {
          const [first] = lobe.items;
          return (
            <div key={lobe.key} className={`lobe lobe-${lobe.key} lobe-${lobe.corner}`} data-lobe={lobe.key}>
              <div className="brain-lit" aria-hidden />
              <Link href={first?.href ?? "/"} className="lobe-hit" aria-label={`${lobe.label}: ${lobe.tagline}. Opens ${first?.label ?? "the dashboard"}.`}>
                <span className="lobe-label" aria-hidden>
                  <b>{lobe.label}</b>
                  <LobeCount hrefs={lobe.items.map((i) => i.href)} />
                </span>
              </Link>
              <div className="lobe-peek" role="group" aria-label={`${lobe.label} pages`}>
                <div className="peek-head">
                  <span className="peek-title">{lobe.label}</span>
                  <span className="peek-tag">{lobe.tagline}</span>
                </div>
                <ul className="peek-list">
                  {lobe.items.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="peek-link">
                        <item.icon size={16} aria-hidden />
                        <span className="peek-text"><b>{item.label}</b><small>{item.hint}</small></span>
                        <LobeCount hrefs={[item.href]} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}

        <BrainCore topics={topics} />
      </div>

      <nav className="brain-stem" aria-label="Daily screens and setup">
        {BRAIN_STEM.map((item) => (
          <Link key={item.href} href={item.href} className="stem-link" title={item.hint}>
            <item.icon size={15} aria-hidden /> {item.label}
            <LobeCount hrefs={[item.href]} />
          </Link>
        ))}
      </nav>

      {/* Phones with JavaScript off cannot hover, and a tap on a lobe opens its main page, so every page is also listed here. */}
      <div className="brain-index">
        {BRAIN_LOBES.map((lobe) => (
          <div key={lobe.key}>
            <h3>{lobe.label}</h3>
            <ul>{lobe.items.map((i) => <li key={i.href}><Link href={i.href}>{i.label}</Link></li>)}</ul>
          </div>
        ))}
      </div>

      <BrainMotion />
    </section>
  );
}
