import Link from "next/link";
import ChatWidget from "@/components/ChatWidget";
import { loadArticles, loadFlows } from "@/lib/store";

export const dynamic = "force-dynamic";

const ORDER = ["Delivery", "Returns", "Account", "Payments", "Contact"];

export default function HelpCentre() {
  const articles = loadArticles();
  const flows = loadFlows();
  const categories = [...new Set([...ORDER, ...articles.map((a) => a.category)])].filter((c) => articles.some((a) => a.category === c));

  return (
    <>
      <header className="border-b border-line bg-paper">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span aria-hidden className="grid place-items-center size-9 rounded-full bg-sage text-cream font-display text-lg">T</span>
            <span className="font-display text-xl tracking-tight">Thistledown Home</span>
          </div>
          <nav className="flex items-center gap-4 text-sm text-ink-soft">
            <span className="hidden sm:inline">Shop</span>
            <span className="font-medium text-ink">Help</span>
            <Link href="/staff" className="rounded-full border border-line px-3 py-1 hover:bg-cream">Staff page</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="bg-cream border-b border-line">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
            <p className="text-sm uppercase tracking-[0.18em] text-sage-dark">Help centre</p>
            <h1 className="font-display text-4xl sm:text-5xl mt-2 max-w-xl leading-tight">How can we help?</h1>
            <p className="mt-3 max-w-lg text-ink-soft">
              Browse our help pages, or open the chat in the corner. It answers from these pages, walks you through common fixes and passes anything else to our team.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-10 grid gap-8 sm:grid-cols-2">
          {categories.map((cat) => (
            <div key={cat}>
              <h2 className="font-display text-2xl mb-3">{cat}</h2>
              <div className="space-y-2">
                {articles.filter((a) => a.category === cat).map((a) => (
                  <details key={a.id} id={`a-${a.id}`} className="group rounded-xl border border-line bg-white open:shadow-sm scroll-mt-24">
                    <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3 font-medium">
                      {a.title}
                      <span aria-hidden className="text-sage transition-transform group-open:rotate-45 text-xl leading-none">+</span>
                    </summary>
                    <div className="px-4 pb-4 text-ink-soft space-y-2 text-[15px] leading-relaxed">
                      {a.body.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}
                      {a.updatedBy && (
                        <p className="text-xs text-sage-dark pt-1">Updated by the {a.updatedBy.replace(" (demo)", "").toLowerCase()} {new Date(a.updatedAt!).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-line text-xs text-ink-soft">
        <div className="mx-auto max-w-5xl px-4 py-6">Thistledown Home is a made-up shop for a demo. No real orders, accounts or people.</div>
      </footer>

      <ChatWidget flows={flows} />
    </>
  );
}
