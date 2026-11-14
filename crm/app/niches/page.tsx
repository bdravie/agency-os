import { PageHeader } from "@/components/ui";
import NicheBoard from "@/components/NicheBoard";
import NicheManager from "@/components/NicheManager";
import NeedsYouCard from "@/components/NeedsYouCard";
import { loadStopRule } from "@/lib/nicheTargets";
import { listNiches } from "@/lib/leadConfig";
import { loadNicheScreen } from "@/lib/nicheScreen";
import { templateStatuses } from "@/lib/outreachTemplates";
import "./niches.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Niches" };

// The Niches screen (docs/NICHE_FOCUS_PLAN.md, N3): which niches you work now and what each may be used for. Refusals elsewhere link here.
export default async function Niches() {
  const [{ cards, problems, recent }, niches, stop] = await Promise.all([loadNicheScreen(), listNiches(), loadStopRule().catch(() => [])]);
  const copy = await templateStatuses(niches.map((n) => n.key));
  return (
    <>
      <PageHeader title="Niches" description="Niches run one after another, not side by side. A niche's status decides what the CRM lets you do with it: search, draft, log sends, or only make content." />
      <NeedsYouCard href="/niches" />
      <NicheBoard cards={cards} problems={problems} recent={recent} stop={Object.fromEntries(stop.map((s) => [s.key, s]))} />
      <div className="card" style={{ marginTop: 24 }}><NicheManager niches={niches} copy={copy} /></div>
    </>
  );
}
