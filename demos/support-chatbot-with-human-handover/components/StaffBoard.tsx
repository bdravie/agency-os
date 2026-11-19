"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Article, ChatReply, Ticket, Unanswered } from "@/lib/types";
import { REASON_TEXT } from "@/lib/types";

type Tab = "gaps" | "handovers" | "articles";
type Draft = { id?: string; title: string; category: string; tags: string; body: string; fixes?: string };

const REASON_LABEL: Record<Unanswered["reason"], string> = {
  no_match: "No help article matched",
  not_in_articles: "Articles didn't cover it",
  failed_check: "Answer failed the check",
  no_api_key: "AI not set up",
  did_not_help: "Customer said it didn't help",
};

const CATEGORIES = ["Delivery", "Returns", "Account", "Payments", "Contact", "General"];
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const blank: Draft = { title: "", category: "General", tags: "", body: "" };

export default function StaffBoard(props: { initialTab: Tab; unanswered: Unanswered[]; tickets: Ticket[]; articles: Article[]; sheetConnected: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(props.initialTab);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [retries, setRetries] = useState<Record<string, ChatReply | "asking">>({});
  const open = props.unanswered.filter((u) => u.status === "open");

  function go(t: Tab) {
    setTab(t);
    window.history.replaceState(null, "", t === "gaps" ? "/staff" : `/staff?tab=${t}`);
  }

  function writeFor(u: Unanswered) {
    setDraft({ ...blank, title: u.question.replace(/\?*$/, "").slice(0, 100), fixes: u.id });
    setSaved("");
    setError("");
    go("articles");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/articles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const data = (await res.json()) as { article?: Article; error?: string };
    setSaving(false);
    if (!data.article) return setError(data.error ?? "Could not save.");
    setSaved(`Saved "${data.article.title}". The chat uses it from the next question.`);
    setDraft(null);
    router.refresh();
  }

  async function askAgain(u: Unanswered) {
    setRetries((r) => ({ ...r, [u.id]: "asking" }));
    const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: u.question, history: [] }) });
    const data = (await res.json()) as { reply: ChatReply };
    setRetries((r) => ({ ...r, [u.id]: data.reply }));
  }

  async function setStatus(u: Unanswered, status: Unanswered["status"]) {
    await fetch("/api/unanswered", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id, status }) });
    router.refresh();
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "gaps", label: "Gaps to fix", count: open.length },
    { key: "handovers", label: "Handovers", count: props.tickets.filter((t) => t.status === "open").length },
    { key: "articles", label: "Help articles", count: props.articles.length },
  ];

  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-2 border-b border-line pb-3 mb-5">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => go(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t.key ? "bg-ink text-cream" : "bg-white border border-line hover:bg-cream"}`}
          >
            {t.label}
            {t.count ? <span className={`ml-2 rounded-full px-1.5 text-xs ${tab === t.key ? "bg-cream/20" : "bg-cream"}`}>{t.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === "gaps" && (
        <section className="space-y-3">
          {open.length === 0 && <Empty text="No gaps right now. Questions the chat can't answer, or that a customer says didn't help, appear here." />}
          {open.map((u) => {
            const retry = retries[u.id];
            return (
              <article key={u.id} className="rounded-xl border border-line bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">&ldquo;{u.question}&rdquo;</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      {when(u.at)} · <span className="text-clay">{REASON_LABEL[u.reason]}</span>
                      {u.nearest ? <> · closest article: {u.nearest}</> : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => writeFor(u)} className="rounded-full bg-sage-dark text-cream px-3 py-1.5 text-sm hover:bg-ink">Write an article for this</button>
                    <button onClick={() => askAgain(u)} className="rounded-full border border-sage text-sage-dark px-3 py-1.5 text-sm hover:bg-sage-pale">Ask the chat again</button>
                    <button onClick={() => setStatus(u, "dismissed")} className="rounded-full border border-line px-3 py-1.5 text-sm hover:bg-cream">Dismiss</button>
                  </div>
                </div>
                {retry && (
                  <div className="mt-3 rounded-lg bg-cream px-3 py-2 text-sm">
                    {retry === "asking" ? "Asking…" : retry.kind === "answer" ? (
                      <>
                        <p><span className="font-medium text-sage-dark">Answered now:</span> {retry.text}</p>
                        <p className="mt-1 text-xs text-ink-soft">Source: {retry.sources.map((s) => s.title).join(", ")}</p>
                        <button onClick={() => setStatus(u, "fixed")} className="mt-2 rounded-full bg-sage-dark text-cream px-3 py-1 text-xs">Mark as fixed</button>
                      </>
                    ) : (
                      <p><span className="font-medium text-clay">Still not answered.</span> {retry.text}</p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {tab === "handovers" && (
        <section className="space-y-3">
          <p className="text-sm text-ink-soft">
            {props.sheetConnected ? "Each handover is also added as a row in the Tickets sheet." : "The Google Sheet is not connected yet (see the README), so handovers are kept here only."}
          </p>
          {props.tickets.length === 0 && <Empty text="No handovers yet. When a customer asks for a person, or two answers don't help, the chat and a short summary land here." />}
          {props.tickets.map((t) => (
            <article key={t.id} className="rounded-xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-display text-lg">{t.id}</span>
                <span className="rounded-full bg-clay-pale text-clay px-2 py-0.5 text-xs">{REASON_TEXT[t.reason]}</span>
                <span className="rounded-full bg-sage-pale text-sage-dark px-2 py-0.5 text-xs">{t.topic}</span>
                <span className="text-xs text-ink-soft">{when(t.createdAt)}</span>
                <span className="ml-auto text-xs text-ink-soft">
                  Sheet: {t.sheet === "sent" ? "row added" : t.sheet === "not_set_up" ? "not connected" : `failed${t.sheetError ? ` (${t.sheetError})` : ""}`}
                </span>
              </div>
              <p className="mt-2">{t.summary}</p>
              <p className="mt-1 text-xs text-ink-soft">
                {t.firstName || "No name given"} · {t.orderNumber || "no order number"}
                {t.flow ? <> · steps: {t.flow}</> : null}
                {t.articlesTried.length ? <> · articles shown: {t.articlesTried.join(", ")}</> : null}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-sage-dark">Chat transcript</summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-cream p-3 text-xs leading-relaxed font-sans">{t.transcript}</pre>
              </details>
            </article>
          ))}
        </section>
      )}

      {tab === "articles" && (
        <section className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display text-xl">Articles the chat answers from</h2>
              <button onClick={() => { setDraft({ ...blank }); setSaved(""); }} className="rounded-full bg-sage-dark text-cream px-3 py-1.5 text-sm hover:bg-ink">Add article</button>
            </div>
            {saved && <p role="status" className="mb-3 rounded-lg bg-sage-pale text-sage-dark px-3 py-2 text-sm">{saved}</p>}
            <ul className="divide-y divide-line rounded-xl border border-line bg-white">
              {props.articles.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div>
                    <p className="font-medium">{a.title}</p>
                    <p className="text-xs text-ink-soft">{a.category}{a.updatedAt ? ` · edited ${when(a.updatedAt)}` : ""}</p>
                  </div>
                  <button
                    onClick={() => { setDraft({ id: a.id, title: a.title, category: a.category, tags: a.tags.join(", "), body: a.body }); setSaved(""); }}
                    className="rounded-full border border-line px-3 py-1 text-sm hover:bg-cream"
                  >
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            {draft ? (
              <form onSubmit={save} className="rounded-xl border border-line bg-white p-4 space-y-3 lg:sticky lg:top-4">
                <h2 className="font-display text-xl">{draft.id ? "Edit article" : "New article"}</h2>
                {draft.fixes && <p className="text-xs text-sage-dark">Written for a question the chat could not answer. Saving marks it as fixed.</p>}
                <label className="block text-sm">Title
                  <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={100} required className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-sage" />
                </label>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block text-sm">Category
                    <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2">
                      {[...new Set([...CATEGORIES, draft.category])].map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm">Search words (comma separated)
                    <input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="gift wrap, wrapping, present" className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-sage" />
                  </label>
                </div>
                <label className="block text-sm">Article text
                  <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={9} maxLength={4000} required className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 leading-relaxed outline-none focus:border-sage" />
                </label>
                <p className="text-xs text-ink-soft">The chat only says what is written here. Leave a blank line between paragraphs.</p>
                {error && <p role="alert" className="text-sm text-clay">{error}</p>}
                <div className="flex gap-2">
                  <button type="submit" disabled={saving} className="rounded-full bg-clay text-white px-4 py-2 font-medium hover:bg-ink disabled:opacity-50">{saving ? "Saving…" : "Save article"}</button>
                  <button type="button" onClick={() => setDraft(null)} className="rounded-full border border-line px-4 py-2 hover:bg-cream">Cancel</button>
                </div>
              </form>
            ) : (
              <Empty text="Pick an article to edit, or add a new one. Use Write an article for this on Gaps to fix to start from a customer's question." />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-line bg-white/60 px-4 py-6 text-sm text-ink-soft">{text}</p>;
}
