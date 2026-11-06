import "../loom-pitch.css";
import { deleteAnswerAction, deleteProofAction, saveAnswerAction, saveProfileAction, saveProofAction } from "@/lib/pitchLibraryActions";
import { loadBank, loadProfile, loadProof } from "@/lib/pitchLibrary";
import { dateOnly } from "@/lib/format";
import ToastForm from "@/components/ToastForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proof and answers" };

const KINDS = { client: "Real client (always \"a client\" aloud)", own_business: "My own business", demo: "Demo", internal_tool: "My own tool" } as const;
const CATEGORIES = { cover_letter: "Cover letter", certifications: "Certifications", experience: "Experience", tone: "Tone of voice", metrics: "Metrics", custom: "Custom" } as const;
const field = (label: string, input: React.ReactNode) => <label className="stack" style={{ gap: 4 }}><span className="field-label">{label}</span>{input}</label>;

function ProofForm({ item }: { item?: Awaited<ReturnType<typeof loadProof>>[number] }) {
  return (
    <ToastForm action={saveProofAction} success={item ? "Project saved" : "Project added"} reset={!item} className="stack" style={{ gap: 10 }}>
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="grid">
        {field("Name", <input name="name" defaultValue={item?.name} required maxLength={120} />)}
        {field("What kind of project", <select name="kind" defaultValue={item?.kind ?? "demo"}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>)}
      </div>
      {field("What it is, in a line (held back from the generator until this is filled in)", <textarea name="one_line" rows={2} defaultValue={item?.one_line ?? ""} />)}
      {field("Problem it solved", <textarea name="problem_solved" rows={2} defaultValue={item?.problem_solved ?? ""} />)}
      <div className="grid">
        {field("Tools used (commas)", <input name="tools" defaultValue={item?.tools.join(", ")} />)}
        {field("Tags (commas)", <input name="tags" defaultValue={item?.tags.join(", ")} />)}
        {field("Link, if there is a public one (optional)", <input name="link" type="url" defaultValue={item?.link ?? ""} placeholder="https://" />)}
        {field("Last worked on (lets the script say \"recently\" for 90 days)", <input name="last_worked_on" type="date" defaultValue={item?.last_worked_on ?? ""} />)}
      </div>
      {field("Results (real numbers only, or leave blank)", <textarea name="results" rows={2} defaultValue={item?.results ?? ""} />)}
      {field("Notes for the generator (what must stay true when this is mentioned)", <textarea name="notes" rows={2} defaultValue={item?.notes ?? ""} />)}
      <div><button className="secondary">{item ? "Save project" : "Add project"}</button></div>
    </ToastForm>
  );
}

function AnswerForm({ a }: { a?: Awaited<ReturnType<typeof loadBank>>[number] }) {
  return (
    <ToastForm action={saveAnswerAction} success={a ? "Answer saved" : "Answer added"} reset={!a} className="stack" style={{ gap: 10 }}>
      {a && <input type="hidden" name="id" value={a.id} />}
      {field("Category", <select name="category" defaultValue={a?.category ?? "custom"}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>)}
      {field("Question", <input name="question" defaultValue={a?.question} required maxLength={500} />)}
      {field("Answer", <textarea name="answer" rows={3} defaultValue={a?.answer} required maxLength={3000} />)}
      <div className="row"><button className="secondary">{a ? "Save answer" : "Add answer"}</button>{a?.last_used_at && <span className="muted">Last used {dateOnly(a.last_used_at)}</span>}</div>
    </ToastForm>
  );
}

export default async function Library() {
  const [profile, proof, bank] = await Promise.all([loadProfile(), loadProof(), loadBank()]);
  return (
    <>
      <PageHeader back={{ href: "/proposals", label: "Proposals" }} title="Proof and answers" description="What a Loom pitch is allowed to say about you. It uses nothing else, so keep this true and it improves as you do." />
      <section className="card" aria-labelledby="profile-h" style={{ marginBottom: 16 }}>
        <h2 id="profile-h">My profile</h2>
        <ToastForm action={saveProfileAction} success="Profile saved" className="stack" style={{ gap: 10 }}>
          {field("Name", <input name="name" defaultValue={profile.name} />)}
          {field("Positioning line (said word for word in the hook)", <textarea name="positioning_line" rows={2} defaultValue={profile.positioning_line} />)}
          {field("Short positioning (finishes \"Hi, I love [work] and ___\" in the cover letter)", <input name="short_positioning" maxLength={40} defaultValue={profile.short_positioning} />)}
          <div className="grid">
            {field("Strong tools (one per line)", <textarea name="strong_tools" rows={8} defaultValue={profile.strong_tools.join("\n")} />)}
            {field("Familiar tools (one per line)", <textarea name="familiar_tools" rows={8} defaultValue={profile.familiar_tools.join("\n")} />)}
          </div>
          {field("Preferred defaults", <input name="preferred_defaults" defaultValue={profile.preferred_defaults} />)}
          {field("Public portfolio links, if you have any (one per line, as Label | https://...)", <textarea name="portfolio_links" rows={3} defaultValue={profile.portfolio_links.map((l) => `${l.label} | ${l.url}`).join("\n")} />)}
          {field("Facts about you the generator may use (one per line)", <textarea name="facts" rows={7} defaultValue={profile.facts.join("\n")} />)}
          <div><button>Save profile</button></div>
        </ToastForm>
      </section>

      <section className="card stack" aria-labelledby="proof-h" style={{ marginBottom: 16, gap: 12 }}>
        <div><h2 id="proof-h">Proof library</h2><p className="muted">Real projects only. The generator picks the single most relevant one for the relevance bridge and proof drop, or leaves them out.</p></div>
        {proof.map((p) => (
          <details key={p.id} className="lp-item">
            <summary><b>{p.name}</b> <span className={`badge tone-${p.kind === "client" ? "good" : "neutral"}`}>{KINDS[p.kind]}</span>{!p.one_line && <span className="badge tone-warn">Held back: no description</span>}</summary>
            <ProofForm item={p} />
            <ToastForm action={deleteProofAction} success="Project removed" confirm={`Remove ${p.name} from your proof library?`} style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={p.id} /><button className="link">Remove</button>
            </ToastForm>
          </details>
        ))}
        <details className="lp-item"><summary><b>Add a project</b></summary><ProofForm /></details>
      </section>

      <section className="card stack" aria-labelledby="bank-h" style={{ gap: 12 }}>
        <div><h2 id="bank-h">Answer bank</h2><p className="muted">Screening answers used word for word, so each application is faster than the last.</p></div>
        {bank.map((a) => (
          <details key={a.id} className="lp-item">
            <summary><b>{a.question}</b> <span className="badge tone-neutral">{CATEGORIES[a.category as keyof typeof CATEGORIES] ?? a.category}</span></summary>
            <AnswerForm a={a} />
            <ToastForm action={deleteAnswerAction} success="Answer removed" confirm="Remove this answer?" style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={a.id} /><button className="link">Remove</button>
            </ToastForm>
          </details>
        ))}
        <details className="lp-item"><summary><b>Add an answer</b></summary><AnswerForm /></details>
      </section>
    </>
  );
}
