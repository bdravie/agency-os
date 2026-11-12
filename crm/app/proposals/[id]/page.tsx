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
import DemoBriefPanel from "@/components/DemoBriefPanel";
import LoomPitchPanel from "@/components/LoomPitchPanel";
import ProposalStageBar from "@/components/ProposalStageBar";
import ProposalActions from "@/components/ProposalActions";
import EditProposalForm from "@/components/EditProposalForm";
import SectionTabs from "@/components/SectionTabs";
import { archiveLabel } from "@/lib/proposalStatus";
import { priceMilestones } from "@/lib/proposalPlanMath";
import { loadRates } from "@/lib/proposalPlan";
import { proposalName } from "@/lib/proposalName";
import { demoBriefPrompt } from "@/lib/demoBriefMath";

export const dynamic = "force-dynamic";

const TABS = ["draft", "fit", "plan", "loom", "improve", "demo"] as const;

export default async function ProposalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [p] = await query<any>(`SELECT * FROM proposals WHERE id = $1`, [id]);
  if (!p) notFound();
  const rates = await loadRates();
  const jobPrice = p.plan?.milestones?.length ? priceMilestones(p.plan.milestones, rates).total : null;
  const isLoom = p.pitch_mode === "loom";
  const asked = (await searchParams).tab;
  const tab = TABS.find((t) => t === asked) ?? (isLoom ? "loom" : "draft");
  const loomOwed = isLoom && !!p.loom_pitch && !p.loom_recorded_at && p.status === "Draft" && !p.archived_at;
  const loomPanel = <LoomPitchPanel id={id} title={proposalName(p)} pitch={p.loom_pitch} pitchAt={p.loom_pitch_at ? String(p.loom_pitch_at) : null} inputs={p.loom_inputs} loomUrl={p.loom_url} />;
  return (
    <>
      <PageHeader
        back={{ href: "/proposals", label: "Proposals" }}
        title={proposalName(p)}
        actions={<ProposalActions id={id} title={proposalName(p)} status={p.status} archived={!!p.archived_at} />}
        description={<span className="row" style={{ gap: 10 }}><Badge value={p.status} />{isLoom && <span className="badge tone-violet">Loom pitch</span>}<span>Fit {p.fit_score}/10</span>{/^https?:\/\//i.test(p.job_url ?? "") && <a href={p.job_url} target="_blank" rel="noreferrer" className="row" style={{ gap: 4 }}>Open on Upwork <ExternalLink size={13} aria-hidden /></a>}</span>}
      />
      <section className="card stack" style={{ gap: 8, marginBottom: 18 }} aria-label="Pipeline">
        <ProposalStageBar id={id} status={p.status} title={proposalName(p)} lostReason={p.lost_reason} />
        {p.archived_at && <p className="muted" style={{ margin: 0 }}>Archived ({archiveLabel(p.archive_reason)}). It is out of the pipeline until you restore it.</p>}
      </section>

      <SectionTabs
        label="Proposal sections"
        current={tab}
        tabs={[
          { key: "draft", label: "Draft", href: `/proposals/${id}?tab=draft` },
          { key: "fit", label: "Fit", href: `/proposals/${id}?tab=fit` },
          { key: "plan", label: "Plan and price", href: `/proposals/${id}?tab=plan`, count: p.plan?.milestones?.length },
          { key: "loom", label: "Loom pitch", href: `/proposals/${id}?tab=loom`, count: loomOwed ? 1 : undefined, hot: loomOwed },
          { key: "improve", label: "Better fit", href: `/proposals/${id}?tab=improve`, count: p.improvements?.actions?.length },
          { key: "demo", label: "Demo brief", href: `/proposals/${id}?tab=demo`, count: p.demo_brief?.gaps?.length },
        ]}
      />

      {tab === "draft" && (
        <div className="stack">
          <div className="grid">
            <ToastForm action={saveProposal} success="Proposal saved" className="card stack" style={{ gap: 10 }}>
              <input type="hidden" name="id" value={id} />
              <h2>{isLoom ? "Tracking" : "Your draft (edit freely)"}</h2>
              {isLoom ? (p.draft && <input type="hidden" name="draft" value={p.draft} />) : <textarea id="draft" name="draft" rows={16} defaultValue={p.draft ?? ""} aria-label="Draft" />}
              <div className="row">
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
          <EditProposalForm p={p} />
          {(!isLoom || p.pack) && <PackPanel id={id} pack={p.pack} packAt={p.pack_at ? String(p.pack_at) : null} loomRecordedAt={p.loom_recorded_at ? String(p.loom_recorded_at) : null} />}
        </div>
      )}

      {tab === "fit" && <FitPanel id={id} score={p.fit_score} fit={p.fit_analysis} />}
      {tab === "plan" && <PlanPanel id={id} plan={p.plan} planAt={p.plan_at ? String(p.plan_at) : null} rates={rates} />}
      {tab === "loom" && loomPanel}
      {tab === "improve" && <ImprovePanel id={id} score={p.fit_score} improvements={p.improvements} at={p.improvements_at ? String(p.improvements_at) : null} hourly={rates.hourly_rate_gbp} jobPrice={jobPrice} />}
      {tab === "demo" && <DemoBriefPanel id={id} brief={p.demo_brief ?? null} prompt={p.demo_brief ? demoBriefPrompt(p.demo_brief, proposalName(p), p.job_text ?? "") : ""} at={p.demo_brief_at ? String(p.demo_brief_at) : null} hourly={rates.hourly_rate_gbp} />}
    </>
  );
}
