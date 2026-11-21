import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import AssistantThread, { AssistantFields } from "@/components/assistant/AssistantThread";
import AskButton from "@/components/assistant/AskButton";
import { latestThreadId, loadThread, usageToday, validThread } from "@/lib/assistant";
import { askFromPage } from "@/lib/assistantActions";
import { knowledgeTopics } from "@/lib/knowledge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ask the brain" };

// The assistant's full page: where the brain's core goes with JavaScript off, and the "open full page" of its panel.
export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ thread?: string; new?: string; error?: string; q?: string }> }) {
  const sp = await searchParams;
  const threadId = sp.new ? null : validThread(sp.thread) ?? await latestThreadId();
  const [messages, topics, usage] = await Promise.all([threadId ? loadThread(threadId) : [], knowledgeTopics(), usageToday()]);

  return (
    <div className="as-page">
      <header className="page-header">
        <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Dashboard</Link> / <span aria-current="page">Ask the brain</span></nav>
        <div className="page-header-row">
          <div>
            <h1>Ask the brain</h1>
            <p className="page-desc">Answers from your knowledge files ({topics.map((t) => t.label).join(", ")}), with the web only when you tick it.</p>
          </div>
          <div className="page-actions"><Link href="/assistant?new=1" className="btn secondary"><MessageSquarePlus size={16} aria-hidden /> New conversation</Link></div>
        </div>
      </header>

      <section className="card as-card" aria-label="Conversation">
        <AssistantThread
          messages={messages}
          empty={<>
            <p><strong>Ask anything about the business.</strong> How a CRM feature works, how to research a niche, a design technique, or which contracts to send a client.</p>
            <ul className="muted">{topics.map((t) => <li key={t.key}><strong>{t.label}:</strong> {t.description}</li>)}</ul>
          </>}
        />
      </section>

      <form action={askFromPage} className="card as-form" aria-label="Ask a question">
        {sp.error && <p className="error" role="alert">{sp.error}</p>}
        <AssistantFields topics={topics} threadId={threadId} draft={sp.error ? sp.q : undefined} idPrefix="page" />
        <div className="row-between as-foot">
          <span className="muted">{usage.asked} of {usage.cap} answers used today · answers run only when you press Ask</span>
          <AskButton />
        </div>
      </form>
      <p className="muted as-teach">To teach it something, add a Markdown file under <code>knowledge/</code> and list it in <code>config/knowledge.yaml</code>.</p>
    </div>
  );
}
