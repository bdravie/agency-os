import { notFound } from "next/navigation";
import ToastForm from "@/components/ToastForm";
import { ExternalLink } from "lucide-react";
import { query } from "@/lib/db";
import { saveProposal } from "@/lib/actions";
import CopyButton from "@/components/CopyButton";
import { Badge, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [p] = await query<any>(`SELECT * FROM proposals WHERE id = $1`, [id]);
  if (!p) notFound();
  return (
    <>
      <PageHeader
        back={{ href: "/proposals", label: "Proposals" }}
        title={p.job_title || `Proposal #${p.id}`}
        description={<span className="row" style={{ gap: 10 }}><Badge value={p.status} /><span>Fit {p.fit_score}/10</span>{p.job_url && <a href={p.job_url} target="_blank" rel="noreferrer" className="row" style={{ gap: 4 }}>Job post <ExternalLink size={13} aria-hidden /></a>}</span>}
      />
      <div className="grid">
        <ToastForm action={saveProposal} success="Proposal saved" className="card stack" style={{ gap: 10 }}>
          <input type="hidden" name="id" value={id} />
          <h2>Your draft (edit freely)</h2>
          <textarea id="draft" name="draft" rows={16} defaultValue={p.draft ?? ""} aria-label="Draft" />
          <div className="row">
            <select name="status" defaultValue={p.status} aria-label="Status">
              {["Draft", "Sent", "Interview", "Won", "Lost"].map((s) => <option key={s}>{s}</option>)}
            </select>
            <input name="connects_used" type="number" min="0" placeholder="Connects used" aria-label="Connects used" defaultValue={p.connects_used ?? ""} style={{ width: 150 }} />
            <button>Save</button>
            <CopyButton targetId="draft" />
          </div>
        </ToastForm>
        <section className="card">
          <h2>Job post</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{p.job_text}</p>
        </section>
      </div>
    </>
  );
}
