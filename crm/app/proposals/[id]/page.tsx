import { notFound } from "next/navigation";
import ToastForm from "@/components/ToastForm";
import { ExternalLink } from "lucide-react";
import { query } from "@/lib/db";
import { saveProposal } from "@/lib/actions";
import CopyButton from "@/components/CopyButton";
import { Badge, PageHeader } from "@/components/ui";
import PackPanel from "@/components/PackPanel";
import FitPanel from "@/components/FitPanel";
import PlanPanel from "@/components/PlanPanel";
import ImprovePanel from "@/components/ImprovePanel";
import LoomPitchPanel from "@/components/LoomPitchPanel";
import { PROPOSAL_STATUSES } from "@/lib/proposalStatus";
import { priceMilestones } from "@/lib/proposalPlanMath";
import { loadRates } from "@/lib/proposalPlan";
import { proposalName } from "@/lib/proposalName";

export const dynamic = "force-dynamic";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [p] = await query<any>(`SELECT * FROM proposals WHERE id = $1`, [id]);
  if (!p) notFound();
  const rates = await loadRates();
  const jobPrice = p.plan?.milestones?.length ? priceMilestones(p.plan.milestones, rates).total : null;
  const isLoom = p.pitch_mode === "loom";
  const loomPanel = <LoomPitchPanel id={id} title={proposalName(p)} pitch={p.loom_pitch} pitchAt={p.loom_pitch_at ? String(p.loom_pitch_at) : null} inputs={p.loom_inputs} loomUrl={p.loom_url} />;
  return (
    <>
      <PageHeader
        back={{ href: "/proposals", label: "Proposals" }}
        title={proposalName(p)}
        description={<span className="row" style={{ gap: 10 }}><Badge value={p.status} />{isLoom && <span className="badge tone-violet">Loom pitch</span>}<span>Fit {p.fit_score}/10</span>{/^https?:\/\//i.test(p.job_url ?? "") && <a href={p.job_url} target="_blank" rel="noreferrer" className="row" style={{ gap: 4 }}>Open on Upwork <ExternalLink size={13} aria-hidden /></a>}</span>}
      />
      <FitPanel id={id} score={p.fit_score} fit={p.fit_analysis} />
      <ImprovePanel id={id} score={p.fit_score} improvements={p.improvements} at={p.improvements_at ? String(p.improvements_at) : null} hourly={rates.hourly_rate_gbp} jobPrice={jobPrice} />
      {isLoom && loomPanel}
      <div className="grid">
        <ToastForm action={saveProposal} success="Proposal saved" className="card stack" style={{ gap: 10 }}>
          <input type="hidden" name="id" value={id} />
          <h2>{isLoom ? "Tracking" : "Your draft (edit freely)"}</h2>
          {isLoom ? (p.draft && <input type="hidden" name="draft" value={p.draft} />) : <textarea id="draft" name="draft" rows={16} defaultValue={p.draft ?? ""} aria-label="Draft" />}
          <div className="row">
            <select name="status" defaultValue={p.status} aria-label="Status">
              {PROPOSAL_STATUSES.map((s) => <option key={s} value={s}>{s === "Won" ? "Won (hired)" : s}</option>)}
            </select>
            <input name="connects_used" type="number" min="0" placeholder="Connects used" aria-label="Connects used" defaultValue={p.connects_used ?? ""} style={{ width: 150 }} />
            <button>Save</button>
            {!isLoom && <CopyButton targetId="draft" />}
          </div>
        </ToastForm>
        <section className="card">
          <h2>Job post</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{p.job_text}</p>
        </section>
      </div>
      <PlanPanel id={id} plan={p.plan} planAt={p.plan_at ? String(p.plan_at) : null} rates={rates} />
      {(!isLoom || p.pack) && <PackPanel id={id} pack={p.pack} packAt={p.pack_at ? String(p.pack_at) : null} loomRecordedAt={p.loom_recorded_at ? String(p.loom_recorded_at) : null} />}
      {!isLoom && loomPanel}
    </>
  );
}
