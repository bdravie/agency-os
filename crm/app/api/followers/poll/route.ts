import { NextResponse } from "next/server";
import { pollAllEnabledAccounts } from "@/lib/followerTracking";

export const dynamic = "force-dynamic";

/**
 * Endpoint called periodically by the dashboard while open (e.g. every 5 minutes)
 * to refresh follower snapshots without user intervention.
 */
export async function POST() {
  try {
    const results = await pollAllEnabledAccounts(false);
    return NextResponse.json({ ok: true, results });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
