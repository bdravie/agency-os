"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { leadSearchStatus, startLeadSearch, type SearchState } from "@/lib/leadSearchActions";

// Looks on the websites of verified leads for generic emails (info@, hello@). Free, respects robots.txt, runs in the background.
export default function EmailFinder() {
  const router = useRouter();
  const [state, action, pending] = useActionState<SearchState, FormData>(startLeadSearch, null);
  const [out, setOut] = useState<{ status: string; output: string } | null>(null);
  const [id, setId] = useState<number | null>(null);
  useEffect(() => { if (state?.id) setId(state.id); }, [state]);
  useEffect(() => {
    if (!id) return;
    let stop = false;
    const tick = async () => {
      const s = await leadSearchStatus(id);
      if (stop || !s) return;
      setOut({ status: s.status, output: s.output });
      if (s.status !== "running") { setId(null); router.refresh(); return; }
      setTimeout(tick, 3000);
    };
    tick();
    return () => { stop = true; };
  }, [id, router]);
  const busy = pending || !!id;
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <input type="hidden" name="kind" value="enrich" />
      <div className="row"><label className="stack" style={{ gap: 4 }}><span className="field-label">How many companies to look at</span><select name="limit" defaultValue="25"><option>10</option><option>25</option><option>50</option></select></label>
        <button className="secondary" disabled={busy} style={{ alignSelf: "flex-end" }}>{busy ? "Looking… (a minute or two)" : "Find generic emails"}</button></div>
      <span className="muted">Only verified, contactable leads that have a website and no email yet. Generic company addresses only.</span>
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      {out && <pre style={{ margin: 0, padding: 12, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, whiteSpace: "pre-wrap", fontSize: 13, maxHeight: 200, overflow: "auto" }}>{out.output || (out.status === "running" ? "Working…" : "")}</pre>}
    </form>
  );
}
