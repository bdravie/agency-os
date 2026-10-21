"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Handshake } from "lucide-react";
import { addSuggestionAsDealAction } from "@/lib/suggestActions";
import { useToast } from "./Toast";

// Free and click-only: makes a deal from this idea, with a written plan, the best way to contact them and two first tasks. Nothing is sent.
export default function AddToDealsButton({ suggestionId, index }: { suggestionId: number; index: number }) {
  const toast = useToast(), router = useRouter();
  const [dealId, setDealId] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const go = () => start(async () => {
    const r = await addSuggestionAsDealAction(suggestionId, index);
    if (r.error || !r.id) { toast(r.error ?? "Couldn't add the deal.", "bad"); return; }
    setDealId(r.id); toast("Added to Deals with a plan"); router.refresh();
  });
  return dealId
    ? <button type="button" className="secondary" onClick={() => router.push(`/deals/${dealId}`)}><Handshake size={15} aria-hidden /> Open the deal</button>
    : <button type="button" className="secondary" disabled={pending} onClick={go}><Handshake size={15} aria-hidden /> {pending ? "Adding…" : "Add to deals"}</button>;
}
