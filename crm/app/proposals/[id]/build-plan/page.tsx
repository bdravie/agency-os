import { cache } from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import "@/app/proposals/client-page.css";
import ClientPageEditor from "@/components/buildPlan/ClientPageEditor";
import ClientPageView from "@/components/buildPlan/ClientPageView";
import { loadUsdRate } from "@/lib/buildPlan";
import type { BuildPlan, Currency } from "@/lib/buildPlanMath";
import { clientPage, clientPageBlock, clientPageHref } from "@/lib/buildPlanPageMath";
import { query } from "@/lib/db";
import { clientPageTitle } from "@/lib/proposalName";
import { loadRates } from "@/lib/proposalPlan";

// The Build plan's client page: the tailored plan as a clean page to show a client on a Loom or a call.
// Put together by code from the plan as saved (no AI runs here), behind the login like every other page, and drawn without the
// sidebar (BARE in components/AppShell.tsx). ?currency=usd shows dollars; ?price=0 leaves the prices off; ?edit=1 turns every piece
// of text into a box the owner can type in (ClientPageEditor). Nothing is sent.
export const dynamic = "force-dynamic";

// The page's own typeface (asked for by the owner, 25 Nov 2026): one plain, bold, easy-to-read face, like a pitch deck.
// It is used on this page only; the CRM keeps the brand sheet's two.
const pitch = Inter({ subsets: ["latin"], display: "swap", variable: "--font-pitch" });

type Row = { job_title: string | null; job_text: string | null; build_plan: BuildPlan | null };
const load = cache(async (id: number): Promise<Row | null> =>
  Number.isInteger(id) ? (await query<Row>(`SELECT job_title, job_text, build_plan FROM proposals WHERE id = $1`, [id]))[0] ?? null : null);
const titleOf = (p: Row) => p.build_plan?.page?.title || clientPageTitle(p.job_title, p.job_text);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = await load(Number((await params).id));
  return { title: { absolute: p ? `Build plan: ${titleOf(p)}` : "Build plan" } };   // the tab is on camera too, so no "Agency OS"
}

export default async function BuildPlanClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ currency?: string; price?: string; edit?: string }> }) {
  const id = Number((await params).id), p = await load(id);
  if (!p) notFound();
  const { currency: asked, price, edit } = await searchParams;
  const [rates, usdToGbp] = await Promise.all([loadRates(), loadUsdRate()]);
  const currency: Currency = asked === "usd" && usdToGbp ? "USD" : "GBP", showPrice = price !== "0";
  const page = clientPage(p.build_plan, rates, { currency, usdToGbp, showPrice });
  const brand = process.env.BUSINESS_NAME?.trim() || "Build plan", sender = process.env.SENDER_NAME?.trim() || null;
  if (!page) {
    return (
      <div className={`cp ${pitch.variable}`}>
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
  const shared = { page, title: titleOf(p), brand, sender, inverse: dark ? "light" : "dark", fontClass: pitch.variable } as const;
  return edit === "1" ? <ClientPageEditor id={id} viewHref={clientPageHref(id, { currency, showPrice })} {...shared} /> : <ClientPageView {...shared} />;
}
