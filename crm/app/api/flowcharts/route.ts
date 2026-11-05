import { createFlowchart, listFlowcharts } from "@/lib/flowchartApi";
import { respond } from "@/lib/flowchartHttp";
import { flowchartStore } from "@/lib/flowcharts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return respond(req, () => listFlowcharts(flowchartStore, new URL(req.url).searchParams.get("q")));
}

export async function POST(req: Request) {
  return respond(req, async () => createFlowchart(flowchartStore, await req.text()));
}
