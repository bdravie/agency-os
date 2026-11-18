import Link from "next/link";
import ReelFrame, { SafeFrame } from "./ReelFrame";
import PlayScope from "./PlayScope";
import TemplateEditor from "./TemplateEditor";
import ToastForm from "../ToastForm";
import { deleteTemplateAction } from "@/lib/editStyleActions";
import { REELS } from "@/lib/reelsBrand";
import { byGroup, cleanTemplate, previewOf, totalSeconds, type Catalogue, type Template } from "@/lib/editStylesMath";

// Content > Styles: every editing element available for a video, drawn as a small reel frame, the templates built from them, and the rules.
// All of it comes from config/edit-styles.yaml (plus the owner's saved templates), the same file Claude reads before an edit. Nothing is edited, generated or sent from here.

const SFX: Record<string, string> = { swoosh: "Swoosh", tick: "Tick", thud: "Thud", bed: "Music bed" };
const VIEWS = [["elements", "Elements"], ["templates", "Templates"], ["rules", "Rules"]] as const;
export type StylesView = (typeof VIEWS)[number][0];
const href = (view: string, extra = "") => `/content?tab=styles${view === "elements" ? "" : `&view=${view}`}${extra}`;

/** A template as a strip of frames, one per beat, left to right. */
export function TemplateStrip({ t, cat, small }: { t: Template; cat: Catalogue; small?: boolean }) {
  const nameOf = (k: string) => cat.elements.find((e) => e.key === k)?.name ?? k;
  return (
    <ol className="es-strip" aria-label={`${t.name}: ${t.beats.length} beats`}>
      {t.beats.map((b, i) => (
        <li key={i} className="es-beat es-play" tabIndex={0}>
          <ReelFrame layout={b.layout} elements={b.elements} label={`Beat ${i + 1}, ${b.label}: ${b.elements.map(nameOf).join(", ")}`} />
          <b>{i + 1}. {b.label}</b>
          {!small && <small>{b.seconds ? `${b.seconds}s · ` : ""}{b.elements.map(nameOf).join(", ")}</small>}
          {!small && b.note && <small>{b.note}</small>}
        </li>
      ))}
    </ol>
  );
}

function Elements({ cat }: { cat: Catalogue }) {
  return (
    <>
      {byGroup(cat).map(({ group, elements }) => (
        <section key={group.key} className="es-group" aria-labelledby={`es-${group.key}`}>
          <header><h2 id={`es-${group.key}`}>{group.name}</h2><span className="muted">{group.blurb}</span></header>
          <div className="es-grid">
            {elements.map((e) => {
              const p = previewOf(e);
              return (
                <article key={e.key} className="es-card es-play" tabIndex={0}>
                  <ReelFrame layout={p.layout} elements={p.elements} label={`${e.name}: ${e.rule}`} />
                  <h3>{e.name}</h3>
                  <p className="es-when">{e.when}</p>
                  <p className="es-rule">{e.rule}</p>
                  <div className="es-tags">
                    {e.timing && <span className="es-tag">{e.timing}</span>}
                    {e.sfx && SFX[e.sfx] && e.group !== "sound" && <span className="es-tag">Sound: {SFX[e.sfx]}</span>}
                    {e.cost && <span className="es-tag cost">{e.cost}</span>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

function Templates({ cat }: { cat: Catalogue }) {
  return (
    <div className="es-tpls">
      {cat.templates.map((t) => {
        const check = t.custom ? cleanTemplate(t, cat) : null;
        const warnings = check && !("error" in check) ? check.warnings : [];
        return (
          <section key={t.key} className="card es-tpl" aria-labelledby={`tpl-${t.key}`}>
            <header>
              <div className="stack" style={{ gap: 6 }}>
                <h3 id={`tpl-${t.key}`}>{t.name}</h3>
                <div className="es-tags">
                  {t.custom ? <span className="es-tag good">Yours</span> : <span className="es-tag">Starter</span>}
                  {t.format && <span className="es-tag">{t.format}</span>}
                  {t.niche && <span className="es-tag">{t.niche.replace(/_/g, " ")}</span>}
                  {t.length && <span className="es-tag">{t.length}</span>}
                  <span className="es-tag">{t.beats.length} beats, about {totalSeconds(t.beats)}s</span>
                </div>
              </div>
              <div className="row">
                <Link href={href("templates", `&edit=${t.key}`)} scroll={false} className="btn secondary">{t.custom ? "Edit" : "Duplicate and edit"}</Link>
                {t.custom && (
                  <ToastForm action={deleteTemplateAction} success="Template deleted" confirm={`Delete "${t.name}"? Videos set to it go back to no template.`}>
                    <input type="hidden" name="key" value={t.key} />
                    <button className="secondary">Delete</button>
                  </ToastForm>
                )}
              </div>
            </header>
            {t.blurb && <p className="muted">{t.blurb}</p>}
            <TemplateStrip t={t} cat={cat} />
            {warnings.length > 0 && <div className="es-warn">Outside the brand sheet:<ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>}
          </section>
        );
      })}
    </div>
  );
}

function Rules({ cat }: { cat: Catalogue }) {
  const tags = [...new Set(cat.rules.map((r) => r.tag))];
  const s = cat.safe;
  return (
    <div className="es-rules">
      <div className="es-safe">
        <SafeFrame safe={s} />
        <dl className="es-key">
          <dt style={{ background: REELS.stop }} /><dd>Keep clear: top</dd><dd className="px">{s.top}px</dd>
          <dt style={{ background: REELS.stop }} /><dd>Keep clear: bottom</dd><dd className="px">{s.bottom}px</dd>
          <dt style={{ background: REELS.stop }} /><dd>Keep clear: right rail</dd><dd className="px">{s.rail}px</dd>
          <dt style={{ background: REELS.go }} /><dd>Safe for text, {s.side}px in from the left</dd><dd className="px" />
          <dt style={{ background: REELS.hivis }} /><dd>Caption line on Face and Punch</dd><dd className="px">{s.caption_face}px</dd>
          <dt style={{ background: REELS.chalk }} /><dd>Caption line under a screen</dd><dd className="px">{s.caption_screen}px</dd>
        </dl>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Measured on a 1080 by 1920 frame.</p>
      </div>
      <div className="card es-rulelist">
        <h2 style={{ margin: 0 }}>Rules on every edit</h2>
        {tags.map((tag) => (
          <section key={tag}>
            <h3>{tag}</h3>
            <ol>{cat.rules.filter((r) => r.tag === tag).map((r) => <li key={r.text}>{r.text}</li>)}</ol>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function StylesPanel({ cat, view, edit }: { cat: Catalogue; view: StylesView; edit?: string }) {
  const editing = view === "templates" && edit ? (edit === "new" ? null : cat.templates.find((t) => t.key === edit) ?? null) : undefined;
  const pills = (
    <div className="pills" role="group" aria-label="Styles views">
      {VIEWS.map(([k, label]) => <Link key={k} href={href(k)} scroll={false} className={`pill${view === k ? " on" : ""}`} aria-current={view === k ? "page" : undefined}>{label}</Link>)}
      {view === "templates" && editing === undefined && <Link href={href("templates", "&edit=new")} scroll={false} className="pill">New template</Link>}
    </div>
  );
  return (
    <PlayScope lead={pills}>
      <p className="muted" style={{ margin: 0 }}>
        {view === "elements" && `${cat.elements.length} elements, drawn in your reel colours. Hover or tap one to play it. Each is the same thing I use when I edit a video for you.`}
        {view === "templates" && "A template is a whole video as beats in order. Pick one on a video's page to get the edit brief for it."}
        {view === "rules" && "The rules every edit follows, and where text is safe on screen."}
      </p>
      {view === "elements" && <Elements cat={cat} />}
      {view === "templates" && editing !== undefined && (
        <TemplateEditor key={edit} cat={cat} start={editing} saveKey={editing?.custom ? editing.key : undefined} basedOn={editing && !editing.custom ? editing.key : undefined} />
      )}
      {view === "templates" && editing === undefined && <Templates cat={cat} />}
      {view === "rules" && <Rules cat={cat} />}
    </PlayScope>
  );
}
