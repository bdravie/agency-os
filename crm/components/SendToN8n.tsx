"use client";

import { ExternalLink, Send } from "lucide-react";
import "@/app/proposals/demo-run.css";
import { useConfirm } from "@/components/ConfirmDialog";
import type { N8nStatus } from "@/lib/n8nPush";
import type { PushResult } from "@/lib/n8nPushMath";

export type N8nSent = { error?: string; summary?: string; results?: PushResult[] };

// Send to my n8n: one button that adds a workflow to the owner's own n8n, used on a proposal's Run a demo tab and in the Build
// plan's step 2. It is always shown. Without an API key it says how to make one instead of doing nothing; with one it asks first,
// naming what is going and where, and the workflow always arrives switched off.
export function SendToN8nButton({ n8n, name, kind, count = 1, disabled, send, onResult, onBusy }: {
  n8n: N8nStatus; name: string; kind: string; count?: number; disabled?: boolean;
  send: () => Promise<N8nSent>; onResult: (r: N8nSent) => void; onBusy?: (busy: boolean) => void;
}) {
  const [confirm, confirmDialog] = useConfirm();
  const click = async () => {
    if (!n8n.ready) {
      onResult({ error: `${n8n.problem ?? "n8n is not set up yet."}${n8n.label ? ` It will then go to n8n at ${n8n.label}.` : ""} The steps are in docs/SETUP.md, section 2e.` });
      return;
    }
    const ok = await confirm({
      title: count === 1 ? "Add this workflow to your n8n?" : `Add these ${count} workflows to your n8n?`,
      details: [[kind, name], ["n8n", n8n.local ? `${n8n.label} (on this computer)` : n8n.label]],
      body: "It is added switched off, and nothing already in n8n is changed. A workflow there with the same name is left as it is.",
      confirmLabel: "Add to n8n",
    });
    if (!ok) return;
    onBusy?.(true);
    try { onResult(await send()); } catch (err) { onResult({ error: err instanceof Error ? err.message : String(err) }); } finally { onBusy?.(false); }
  };
  return (
    <>
      <button type="button" className="secondary" disabled={disabled} onClick={click}><Send size={14} aria-hidden /> Send to my n8n</button>
      {confirmDialog}
    </>
  );
}

/** How a send went: one line, then each workflow with a link to open it in n8n. */
export function N8nSentView({ sent }: { sent: N8nSent }) {
  const failed = sent.results?.some((x) => x.status === "failed");
  return (
    <div className="dr-result">
      {sent.error && <p className="error" role="alert">{sent.error}</p>}
      {sent.summary && <p className={failed ? undefined : "dr-ok"} role="status">{sent.summary}</p>}
      {sent.results && sent.results.length > 0 && (
        <ul className="dr-sent">
          {sent.results.map((x) => (
            <li key={x.name}>
              <span className={`badge tone-${x.status === "added" ? "good" : x.status === "already" ? "neutral" : "bad"}`}>{x.status === "added" ? "Added" : x.status === "already" ? "Already there" : "Not added"}</span>
              <span><b>{x.name}</b>{x.url && <> · <a href={x.url} target="_blank" rel="noopener noreferrer">Open in my n8n <ExternalLink size={13} aria-hidden /></a></>}<br /><span className="muted">{x.note}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
