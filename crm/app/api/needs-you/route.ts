import { NextResponse } from "next/server";
import { buildId } from "@/lib/buildId";
import { loadNeedCounts } from "@/lib/needsYou";

export const dynamic = "force-dynamic";

// Called by the open CRM tab: the numbers for the sidebar. Login is enforced by middleware.
export async function GET() {
  return NextResponse.json({ ...(await loadNeedCounts()), build: buildId() });
}
