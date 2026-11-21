"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, MessageSquarePlus, Sparkles, X } from "lucide-react";
import Modal from "@/components/Modal";
import AssistantThread, { AssistantFields } from "./AssistantThread";
import AskButton from "./AskButton";
import { askInPanel, openPanel, type PanelState } from "@/lib/assistantActions";

type Topic = { key: string; label: string; description: string };

// The panel the brain's core opens: the latest conversation and a question box, answering in place.
// `view` is the one source of truth; each answer replaces it with the whole conversation from the server.
export default function AssistantPanel({ topics, onClose }: { topics: Topic[]; onClose: () => void }) {
  const [view, setView] = useState<PanelState | null>(null);
  const [formKey, setFormKey] = useState(0);   // remounts the form: empty after an answer, holding the question after an error
  const [thinking, setThinking] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => { let live = true; openPanel(false).then((s) => { if (live) setView(s); }); return () => { live = false; }; }, []);
  useEffect(() => { body.current?.querySelector("#latest")?.scrollIntoView({ block: "start" }); }, [view?.messages.length, thinking]);

  async function submit(fd: FormData) {
    if (!view) return;
    setThinking(true);
    try {
      const next = await askInPanel(view, fd);
      setView(next);
      setFormKey((k) => k + 1);
    } finally { setThinking(false); }
  }

  const current = view ?? { threadId: null, messages: [], error: null, usage: null };
  return (
    <Modal drawer label="Ask the brain" onClose={onClose}>
      <aside className="drawer as-drawer">
        <header className="drawer-head">
          <div style={{ minWidth: 0 }}>
            <div className="muted as-kicker"><Sparkles size={14} aria-hidden /> The brain&apos;s core</div>
            <h2 className="drawer-title">Ask the brain</h2>
          </div>
          <div className="row as-head-actions">
            <button type="button" className="secondary" disabled={thinking || !view} onClick={() => { setView({ threadId: null, messages: [], error: null, usage: current.usage }); setFormKey((k) => k + 1); }}>
              <MessageSquarePlus size={15} aria-hidden /> New
            </button>
            <a href={current.threadId ? `/assistant?thread=${current.threadId}` : "/assistant?new=1"} className="btn secondary"><ExternalLink size={15} aria-hidden /> Full page</a>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </header>
        <div className="drawer-body as-drawer-body" ref={body}>
          {!view ? <p className="muted">Loading your last conversation…</p> : (
            <AssistantThread
              messages={current.messages}
              empty={<>
                <p><strong>Ask anything about the business.</strong> The CRM, research, design techniques or client contracts.</p>
                <ul className="muted">{topics.map((t) => <li key={t.key}><strong>{t.label}:</strong> {t.description}</li>)}</ul>
              </>}
            />
          )}
          {thinking && <p className="as-thinking" role="status"><span className="as-dots" aria-hidden><i /><i /><i /></span> Reading your files and thinking…</p>}
        </div>
        <form
          key={formKey}
          ref={form}
          className="as-form as-drawer-form"
          action={submit}
          onKeyDown={(e) => {
            // Enter asks, Shift+Enter is a new line; never while an input method is composing a character.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && (e.target as HTMLElement).tagName === "TEXTAREA") {
              e.preventDefault();
              if (!thinking) form.current?.requestSubmit();
            }
          }}
        >
          {current.error && <p className="error" role="alert">{current.error}</p>}
          <AssistantFields topics={topics} threadId={current.threadId} draft={current.error ? current.draft : undefined} idPrefix="panel" autoFocus />
          <div className="row-between as-foot">
            <span className="muted">{current.usage ? `${current.usage.asked} of ${current.usage.cap} answers today` : ""}</span>
            <AskButton />
          </div>
        </form>
      </aside>
    </Modal>
  );
}
