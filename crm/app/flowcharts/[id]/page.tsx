import { notFound } from "next/navigation";
import WorkspaceLoader from "@/components/flowcharts/WorkspaceLoader";
import { parseFlowchartId } from "@/lib/flowchartMath";
import { flowchartStore } from "@/lib/flowcharts";

export const dynamic = "force-dynamic";

export default async function FlowchartPage({ params }: { params: Promise<{ id: string }> }) {
  const id = parseFlowchartId((await params).id);
  const row = id && (await flowchartStore.get(id));
  if (!row) notFound();
  return <WorkspaceLoader id={row.id} version={row.version} initial={{ title: row.title, code: row.code, theme: row.theme }} />;
}
