import { ExternalLink, FileText } from "lucide-react";
import { parseAnswer, parseInline } from "@/lib/knowledgeMath";
import type { AssistantMessage, AssistantSource } from "@/lib/assistant";
import "./assistant.css";

// One conversation with the knowledge-base assistant. Answers are parsed into blocks and drawn as React elements: the AI's text is never injected as HTML.

function Inline({ text, msgId, sources }: { text: string; msgId: number; sources: AssistantSource[] }) {
  return (
    <>
      {parseInline(text).map((s, i) => {
        if (s.t === "bold") return <strong key={i}>{s.v}</strong>;
        if (s.t === "code") return <code key={i}>{s.v}</code>;
        if (s.t === "cite") {
          const src = sources.find((x) => x.ref === s.v);
          return src
            ? <a key={i} className="as-cite" href={`#src-${msgId}-${s.v}`} title={src.title}>{s.v}</a>
            : null;   // a marker with no source behind it is dropped, never shown as if it were evidence
        }
        return <span key={i}>{s.v}</span>;
      })}
    </>
  );
}

function AnswerBody({ msg }: { msg: AssistantMessage }) {
  return (
    <div className="as-answer">
      {parseAnswer(msg.content).map((b, i) => {
        if (b.kind === "h") return <h3 key={i}><Inline text={b.text} msgId={msg.id} sources={msg.sources} /></h3>;
        if (b.kind === "code") return <pre key={i}><code>{b.text}</code></pre>;
        if ("items" in b) {
          const List = b.kind;
          return <List key={i}>{b.items.map((it, j) => <li key={j}><Inline text={it} msgId={msg.id} sources={msg.sources} /></li>)}</List>;
        }
        return <p key={i}><Inline text={b.text} msgId={msg.id} sources={msg.sources} /></p>;
      })}
    </div>
  );
}

function Sources({ msg }: { msg: AssistantMessage }) {
  if (!msg.sources.length) return <p className="as-nosrc">Not from your knowledge files.</p>;
  return (
    <ol className="as-sources" aria-label="Sources">
      {msg.sources.map((s) => (
        <li key={s.ref} id={`src-${msg.id}-${s.ref}`}>
          <span className="as-ref">{s.ref}</span>
          {s.kind === "web" && s.url
            ? <a href={s.url} target="_blank" rel="noreferrer noopener"><ExternalLink size={13} aria-hidden /> {s.title}</a>
            : <span title={s.path}><FileText size={13} aria-hidden /> {s.title} <span className="muted">· {s.path}</span></span>}
        </li>
      ))}
    </ol>
  );
}

export default function AssistantThread({ messages, empty }: { messages: AssistantMessage[]; empty?: React.ReactNode }) {
  if (!messages.length) return <div className="as-empty">{empty}</div>;
  return (
    <ol className="as-thread" aria-label="Conversation">
      {messages.map((m, i) => (
        <li key={m.id} id={i === messages.length - 1 ? "latest" : undefined} className={`as-msg as-${m.role}`}>
          {m.role === "user"
            ? <p className="as-q">{m.content}</p>
            : <><AnswerBody msg={m} /><Sources msg={m} /></>}
        </li>
      ))}
    </ol>
  );
}

const TOPIC_ANY = "";

/** The question box, topic picker and web tick, as plain form fields: they post without JavaScript. */
export function AssistantFields({ topics, threadId, draft }: {
  topics: { key: string; label: string; description: string }[];
  threadId: string | null;
  draft?: string;
}) {
  return (
    <>
      {threadId && <input type="hidden" name="thread" value={threadId} />}
      <label htmlFor="assistant-q" className="field-label">Your question</label>
      <textarea
        id="assistant-q"
        name="question"
        rows={3}
        required
        maxLength={2000}
        defaultValue={draft}
        placeholder="For example: which contracts do I send before a clinic build?"
      />
      <div className="as-opts">
        <label className="as-topic">
          <span className="field-label">Look in</span>
          <select name="topic" defaultValue={TOPIC_ANY}>
            <option value={TOPIC_ANY}>All topics</option>
            {topics.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        <label className="as-web">
          <input type="checkbox" name="web" /> Search the web too
        </label>
      </div>
    </>
  );
}
