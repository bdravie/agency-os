import Link from "next/link";
import StaffBoard from "@/components/StaffBoard";
import { hasKey, MODEL } from "@/lib/claude";
import { loadArticles, loadTickets, loadUnanswered } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support team (demo)" };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const sheetConnected = Boolean(process.env.SHEETS_WEBHOOK_URL && process.env.SHEETS_WEBHOOK_SECRET);
  return (
    <>
      <header className="border-b border-line bg-ink text-cream">
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-sage-pale">Thistledown Home · support team</p>
            <h1 className="font-display text-2xl">Chat review</h1>
          </div>
          <Link href="/" className="rounded-full border border-cream/40 px-3 py-1 text-sm hover:bg-cream/10">← Help centre</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <p className="mb-5 text-sm text-ink-soft max-w-3xl">
          Questions the chat could not answer, chats handed to the team, and the help articles it answers from. An article saved here is used by the very next question.
          In a real build this page sits behind the team&apos;s own sign-in.
        </p>
        <p className="mb-5 flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-1 ${hasKey() ? "bg-sage-pale text-sage-dark" : "bg-clay-pale text-clay"}`}>
            {hasKey() ? `Answers: ${MODEL}` : "Answers: offline mode (no ANTHROPIC_API_KEY found)"}
          </span>
          <span className={`rounded-full px-2.5 py-1 ${sheetConnected ? "bg-sage-pale text-sage-dark" : "bg-cream text-ink-soft"}`}>
            {sheetConnected ? "Google Sheet: connected" : "Google Sheet: not connected"}
          </span>
        </p>
        <StaffBoard
          initialTab={tab === "handovers" || tab === "articles" ? tab : "gaps"}
          unanswered={loadUnanswered()}
          tickets={loadTickets()}
          articles={loadArticles()}
          sheetConnected={sheetConnected}
        />
      </main>
    </>
  );
}
