import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import "@/app/proposals/client-page.css";
import ClientPageView from "@/components/buildPlan/ClientPageView";
import { loadUsdRate } from "@/lib/buildPlan";
import type { BuildPlan } from "@/lib/buildPlanMath";
import { clientPage, clientPageBlock } from "@/lib/buildPlanPageMath";
import { query } from "@/lib/db";
import { titleFromJob } from "@/lib/proposalName";
import { loadRates } from "@/lib/proposalPlan";

// The Build plan's client page: the tailored plan as a clean page to show a client on a Loom or a call.
// Put together by code from the plan as saved (no AI runs here), behind the login like every other page, and drawn without the
// sidebar (BARE in components/AppShell.tsx). ?currency=usd shows dollars; ?price=0 leaves the prices off. Nothing is sent.
export const dynamic = "force-dynamic";

type Row = { job_title: string | null; job_text: string | null; build_plan: BuildPlan | null };
const load = cache(async (id: number): Promise<Row | null> =>
  Number.isInteger(id) ? (await query<Row>(`SELECT job_title, job_text, build_plan FROM proposals WHERE id = $1`, [id]))[0] ?? null : null);
const titleOf = (p: Row) => (p.job_title ?? "").replace(/\s+/g, " ").trim() || titleFromJob(p.job_text ?? "") || "Your project";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = await load(Number((await params).id));
  return { title: { absolute: p ? `Build plan: ${titleOf(p)}` : "Build plan" } };   // the tab is on camera too, so no "Agency OS"
}

export default async function BuildPlanClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ currency?: string; price?: string }> }) {
  const id = Number((await params).id), p = await load(id);
  if (!p) notFound();
  const { currency, price } = await searchParams;
  const [rates, usdToGbp] = await Promise.all([loadRates(), loadUsdRate()]);
  const page = clientPage(p.build_plan, rates, { currency: currency === "usd" && usdToGbp ? "USD" : "GBP", usdToGbp, showPrice: price !== "0" });
  const brand = process.env.BUSINESS_NAME?.trim() || "Build plan", sender = process.env.SENDER_NAME?.trim() || null;
  if (!page) {
    return (
      <div className="cp">
        <main className="cp-main">
          <div className="cp-card cp-empty">
            <h1>Nothing to show yet</h1>
            <p>{clientPageBlock(p.build_plan)}</p>
            <Link className="btn secondary" href={`/proposals/${id}?tab=build`}>Back to the build plan</Link>
          </div>
        </main>
      </div>
    );
  }
  const dark = (await cookies()).get("theme")?.value === "dark";
  return <ClientPageView page={page} title={titleOf(p)} brand={brand} sender={sender} inverse={dark ? "light" : "dark"} />;
}
