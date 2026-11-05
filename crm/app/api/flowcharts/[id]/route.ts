import { deleteFlowchart, loadFlowchart, saveFlowchart } from "@/lib/flowchartApi";
import { respond } from "@/lib/flowchartHttp";
import { flowchartStore } from "@/lib/flowcharts";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  return respond(req, async () => loadFlowchart(flowchartStore, (await params).id));
}

export async function PATCH(req: Request, { params }: Ctx) {
  return respond(req, async () => saveFlowchart(flowchartStore, (await params).id, await req.text()));
}

export async function DELETE(req: Request, { params }: Ctx) {
  return respond(req, async () => deleteFlowchart(flowchartStore, (await params).id));
}
