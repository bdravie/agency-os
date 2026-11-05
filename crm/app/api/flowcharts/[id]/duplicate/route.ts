import { duplicateFlowchart } from "@/lib/flowchartApi";
import { respond } from "@/lib/flowchartHttp";
import { flowchartStore } from "@/lib/flowcharts";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(req, async () => duplicateFlowchart(flowchartStore, (await params).id));
}
