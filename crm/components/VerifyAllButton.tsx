"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { verifyUncheckedAction } from "@/lib/complianceActions";

// Checks the next 25 unverified leads that have a company number against Companies House (free, about 15 seconds).
export default function VerifyAllButton({ unchecked }: { unchecked: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ message: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();
  if (unchecked === 0) return null;
  return (
    <div className="row" style={{ gap: 10, marginBottom: 12 }}>
      <button type="button" className="secondary" disabled={pending} onClick={() => start(async () => { setMsg(await verifyUncheckedAction()); router.refresh(); })}>
        <ShieldCheck size={15} aria-hidden /> {pending ? "Checking Companies House…" : `Verify ${Math.min(unchecked, 25)} unchecked`}
      </button>
      <span className="muted">{unchecked} lead{unchecked === 1 ? " is" : "s are"} not verified yet, so outreach is blocked for them. Free.</span>
      {msg && <span role="status" className={msg.error ? "error" : "muted"}>{msg.message}</span>}
    </div>
  );
}
