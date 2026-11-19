"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatReply, Flow, FlowOption, Source, Ticket, Turn } from "@/lib/types";

type Msg =
  | { id: number; who: "customer"; text: string }
  | { id: number; who: "bot"; text: string; kind?: ChatReply["kind"]; sources?: Source[]; question?: string; rated?: "yes" | "no"; actions?: Action[]; used?: boolean }
  | { id: number; who: "handover"; reason: Ticket["reason"]; done?: { id: string; sheet: Ticket["sheet"] } };

type Action = { label: string; run: () => void; primary?: boolean };

const GREETING = "Hi, I'm the Thistledown Home help chat. Ask me anything about orders, returns, your account or payments, or pick a common issue.";

let seq = 0;
const nextId = () => ++seq;

/** Opens the cited article on the page and flashes it, so the viewer sees where the answer came from. */
function showArticle(id: string) {
  const el = document.getElementById(`a-${id}`) as HTMLDetailsElement | null;
  if (!el) return;
  el.open = true;
  el.scrollIntoView({ block: "center" });
  el.classList.remove("cited");
  void el.offsetWidth;
  el.classList.add("cited");
}

export default function ChatWidget({ flows }: { flows: Flow[] }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [flowPath, setFlowPath] = useState<string | undefined>();
  const turns = useRef<Turn[]>([]);
  const failures = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const push = (...m: Msg[]) => setMsgs((prev) => [...prev, ...m]);
  const say = (text: string, extra: Partial<Extract<Msg, { who: "bot" }>> = {}) => {
    turns.current.push({ who: "bot", text, sources: extra.sources?.map((s) => s.title) });
    push({ id: nextId(), who: "bot", text, ...extra });
  };
  const customer = (text: string) => {
    turns.current.push({ who: "customer", text });
    push({ id: nextId(), who: "customer", text });
  };
  /** Buttons work once: after a click they grey out, like a real chat. */
  const spend = (id: number) => setMsgs((prev) => prev.map((m) => (m.id === id && m.who === "bot" ? { ...m, used: true } : m)));

  function handover(reason: Ticket["reason"]) {
    push({ id: nextId(), who: "handover", reason });
  }

  /** Two answers that did not settle it (not sure, or "That didn't help") send the chat to a person. */
  function countFailure(): number {
    failures.current += 1;
    return failures.current;
  }

  function restart() {
    turns.current = [];
    failures.current = 0;
    setFlowPath(undefined);
    setMsgs([{ id: nextId(), who: "bot", text: GREETING }]);
    turns.current.push({ who: "bot", text: GREETING });
  }

  useEffect(() => {
    restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = turns.current.slice(-6);
    customer(q);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, history }) });
      const data = (await res.json()) as { reply?: ChatReply; masked?: boolean; error?: string };
      if (!data.reply) throw new Error(data.error ?? "No reply");
      if (data.masked) say("I've removed the contact details you typed. There's no need to share email addresses or phone numbers here.");
      const r = data.reply;
      if (r.kind === "answer") {
        say(r.text, { kind: "answer", sources: r.sources, question: q });
      } else if (r.kind === "unhappy") {
        say(r.text, { kind: "unhappy" });
        handover("unhappy");
      } else {
        const n = countFailure();
        if (n >= 2) {
          say("I haven't managed to sort this for you, so I'll pass it to a person in our customer team with this chat attached.", { kind: "not_sure" });
          handover("two_failed_answers");
        } else {
          const id = nextId();
          turns.current.push({ who: "bot", text: r.text });
          push({
            id, who: "bot", text: r.text, kind: "not_sure",
            actions: [
              { label: "Pass to a person", primary: true, run: () => { spend(id); customer("Pass to a person"); handover("asked_for_person"); } },
              { label: "Ask something else", run: () => { spend(id); inputRef.current?.focus(); } },
            ],
          });
        }
      }
    } catch {
      say("Sorry, the chat could not answer just now. You can pass your question to a person instead.", { kind: "not_sure" });
      handover("asked_for_person");
    } finally {
      setBusy(false);
    }
  }

  function rate(m: Extract<Msg, { who: "bot" }>, helped: boolean) {
    setMsgs((prev) => prev.map((x) => (x.id === m.id ? { ...x, rated: helped ? "yes" : "no" } : x)));
    if (helped) {
      customer("That helped");
      say("Great, glad that's sorted. Anything else?");
      return;
    }
    customer("That didn't help");
    void fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: m.question, source: m.sources?.[0]?.title }) });
    const n = countFailure();
    if (n >= 2) {
      say("Sorry that didn't help either. I'll pass this to a person in our customer team with this chat attached.");
      handover("two_failed_answers");
    } else {
      say("Sorry about that. Could you tell me a bit more, or would you like a person to help?", {
        actions: [{ label: "Pass to a person", primary: true, run: () => { customer("Pass to a person"); handover("asked_for_person"); } }],
      });
    }
  }

  // ---- scripted troubleshooting: one question at a time, buttons only

  function startFlow(flow: Flow) {
    customer(flow.label);
    setFlowPath(flow.label);
    showStep(flow, flow.start, [flow.label]);
  }

  function showStep(flow: Flow, stepId: string, path: string[]) {
    const step = flow.steps[stepId];
    const id = nextId();
    turns.current.push({ who: "bot", text: step.text });
    push({
      id, who: "bot", text: step.text,
      actions: step.options.map((o) => ({ label: o.label, run: () => choose(flow, id, o, path) })),
    });
  }

  function choose(flow: Flow, msgId: number, o: FlowOption, path: string[]) {
    spend(msgId);
    customer(o.label);
    const nextPath = [...path, o.label];
    setFlowPath(nextPath.join(" > "));
    if (o.next) return showStep(flow, o.next, nextPath);
    if (o.end === "not-fixed") {
      say("Thanks for trying those steps. This needs someone from our team to look into, so I'll pass it on with everything you've told me.", { sources: [{ id: flow.article, title: flow.label }] });
      return handover("flow_not_fixed");
    }
    const id = nextId();
    turns.current.push({ who: "bot", text: "Has that sorted it?" });
    push({
      id, who: "bot", text: "Has that sorted it?",
      actions: [
        { label: "Yes, it's fixed", primary: true, run: () => { spend(id); customer("Yes, it's fixed"); setFlowPath(undefined); say("Brilliant. If anything else comes up, just ask."); } },
        { label: "No, still a problem", run: () => { spend(id); customer("No, still a problem"); say("Sorry about that. I'll pass this to a person with what we've tried."); handover("flow_not_fixed"); } },
      ],
    });
  }

  const quickPicks = msgs.length <= 1;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-sage-dark text-cream pl-4 pr-5 py-3 shadow-lg hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          <span aria-hidden className="text-lg">💬</span> Chat with us
        </button>
      )}

      {open && (
        <section
          aria-label="Help chat"
          className="rise fixed z-40 bottom-4 right-4 flex flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-2xl w-[min(400px,calc(100vw-32px))] h-[min(640px,calc(100svh-90px))]"
        >
          <header className="flex items-center justify-between gap-2 bg-sage-dark text-cream px-4 py-3">
            <div>
              <p className="font-display text-lg leading-tight">Thistledown help</p>
              <p className="text-xs text-sage-pale">Answers from our help pages · a person when needed</p>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={restart} className="whitespace-nowrap rounded-full px-2 py-1 text-xs hover:bg-ink/30">Start again</button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-full size-8 hover:bg-ink/30 text-lg leading-none">×</button>
            </div>
          </header>

          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3" aria-live="polite">
            {msgs.map((m) =>
              m.who === "customer" ? (
                <div key={m.id} className="rise flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-sage text-cream px-3.5 py-2 text-[15px]">{m.text}</p>
                </div>
              ) : m.who === "bot" ? (
                <div key={m.id} className="rise max-w-[90%]">
                  <div className={`rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[15px] leading-relaxed ${m.kind === "not_sure" || m.kind === "unhappy" ? "bg-clay-pale" : "bg-white border border-line"}`}>
                    <p>{m.text}</p>
                    {m.sources && m.sources.length > 0 && m.kind === "answer" && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-ink-soft">Source:</span>
                        {m.sources.map((s) => (
                          <button key={s.id} type="button" onClick={() => showArticle(s.id)} className="rounded-full bg-sage-pale text-sage-dark px-2.5 py-1 font-medium hover:bg-sage hover:text-cream">
                            {s.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {m.kind === "answer" && !m.rated && (
                    <div className="mt-1.5 flex gap-2 text-xs">
                      <button type="button" onClick={() => rate(m, true)} className="rounded-full border border-line px-2.5 py-1 hover:bg-cream">That helped</button>
                      <button type="button" onClick={() => rate(m, false)} className="rounded-full border border-line px-2.5 py-1 hover:bg-cream">That didn't help</button>
                    </div>
                  )}
                  {m.actions && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.actions.map((a) => (
                        <button
                          key={a.label}
                          type="button"
                          disabled={m.used}
                          onClick={a.run}
                          className={`rounded-full px-3 py-1.5 text-sm border disabled:opacity-40 disabled:cursor-default ${a.primary ? "bg-sage-dark text-cream border-sage-dark hover:bg-ink" : "bg-white border-sage text-sage-dark hover:bg-sage-pale"}`}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <HandoverCard key={m.id} reason={m.reason} done={m.done} flow={flowPath} turns={turns} onDone={(done) => {
                  setMsgs((prev) => prev.map((x) => (x.id === m.id ? { ...x, done } : x)));
                  turns.current.push({ who: "bot", text: `Passed to the customer team as ticket ${done.id}.` });
                }} />
              ),
            )}

            {quickPicks && (
              <div className="flex flex-wrap gap-2 pt-1">
                {flows.map((f) => (
                  <button key={f.id} type="button" onClick={() => startFlow(f)} className="rounded-full border border-sage bg-white px-3 py-1.5 text-sm text-sage-dark hover:bg-sage-pale">
                    {f.label}
                  </button>
                ))}
                <button type="button" onClick={() => { customer("Talk to a person"); handover("asked_for_person"); }} className="rounded-full border border-clay bg-white px-3 py-1.5 text-sm text-clay hover:bg-clay-pale">
                  Talk to a person
                </button>
              </div>
            )}

            {busy && (
              <p className="typing text-2xl leading-none text-sage px-2" aria-label="The help chat is typing">
                <span>•</span><span>•</span><span>•</span>
              </p>
            )}
          </div>

          <form
            className="border-t border-line bg-white p-2 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); void ask(input); }}
          >
            <label htmlFor="chat-input" className="sr-only">Your question</label>
            <input
              id="chat-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question…"
              maxLength={500}
              autoComplete="off"
              className="flex-1 min-w-0 rounded-full border border-line bg-paper px-4 py-2 outline-none focus:border-sage"
            />
            <button type="submit" disabled={busy || !input.trim()} className="rounded-full bg-clay text-white px-4 py-2 font-medium disabled:opacity-40 hover:bg-ink">
              Send
            </button>
          </form>
        </section>
      )}
    </>
  );
}

function HandoverCard({ reason, done, flow, turns, onDone }: {
  reason: Ticket["reason"];
  done?: { id: string; sheet: Ticket["sheet"] };
  flow?: string;
  turns: React.RefObject<Turn[]>;
  onDone: (d: { id: string; sheet: Ticket["sheet"] }) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [order, setOrder] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  if (done) {
    return (
      <div className="rise rounded-2xl border border-sage bg-sage-pale px-4 py-3 text-[15px]">
        <p className="font-medium text-sage-dark">Passed to our customer team: ticket {done.id}</p>
        <p className="mt-1 text-ink-soft">They have this chat, so you won't need to repeat yourself. They reply during opening hours.</p>
        <p className="mt-2 text-xs text-ink-soft">
          Demo: {done.sheet === "sent" ? "added as a row in the Tickets sheet." : done.sheet === "not_set_up" ? "saved on the staff page (the Google Sheet is not connected yet)." : "saved on the staff page; the Google Sheet did not confirm the row."}
        </p>
      </div>
    );
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    const res = await fetch("/api/handover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turns: turns.current, reason, firstName, orderNumber: order, flow }),
    });
    const data = (await res.json()) as { ticket?: { id: string; sheet: Ticket["sheet"] }; error?: string };
    setSending(false);
    if (data.ticket) onDone(data.ticket);
    else setError(data.error ?? "That didn't go through. Please try again.");
  }

  return (
    <form onSubmit={send} className="rise rounded-2xl border border-clay/40 bg-white px-4 py-3 space-y-2.5">
      <p className="font-medium">Pass this chat to a person</p>
      <p className="text-xs text-ink-soft">Optional, so the team can find your order. Please don't add email addresses or phone numbers.</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-ink-soft">First name
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={30} autoComplete="off" className="mt-1 w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-ink outline-none focus:border-sage" />
        </label>
        <label className="text-xs text-ink-soft">Order number
          <input value={order} onChange={(e) => setOrder(e.target.value)} maxLength={9} placeholder="TH-10482" autoComplete="off" className="mt-1 w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-ink uppercase outline-none focus:border-sage" />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-clay">{error}</p>}
      <button type="submit" disabled={sending} className="w-full rounded-full bg-sage-dark text-cream py-2 font-medium hover:bg-ink disabled:opacity-50">
        {sending ? "Passing it on…" : "Send to the team"}
      </button>
    </form>
  );
}
