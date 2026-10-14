import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { saveProposal } from "@/lib/actions";
import CopyButton from "@/components/CopyButton";

export const dynamic = "force-dynamic";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [p] = await query<any>(`SELECT * FROM proposals WHERE id = $1`, [id]);
  if (!p) notFound();
  return (
    <>
      <p><Link href="/proposals">← Proposals</Link></p>
      <h1>{p.job_title || `Proposal #${p.id}`}</h1>
      <p className="muted">Fit score {p.fit_score}/10{p.job_url && <> · <a href={p.job_url} target="_blank" rel="noreferrer">Job post</a></>}</p>
      <div className="grid">
        <form action={saveProposal} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input type="hidden" name="id" value={id} />
          <h2>Draft (edit freely)</h2>
          <textarea id="draft" name="draft" rows={14} defaultValue={p.draft ?? ""} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select name="status" defaultValue={p.status}>
              {["Draft", "Sent", "Interview", "Won", "Lost"].map((s) => <option key={s}>{s}</option>)}
            </select>
            <input name="connects_used" type="number" min="0" placeholder="Connects used" defaultValue={p.connects_used ?? ""} />
            <button>Save</button>
            <CopyButton targetId="draft" />
          </div>
        </form>
        <section className="card">
          <h2>Job post</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{p.job_text}</p>
        </section>
      </div>
    </>
  );
}
