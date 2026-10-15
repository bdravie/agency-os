"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { setCompanyStatus } from "@/lib/actions";
import { useToast } from "./Toast";

const STEPS = ["New", "Contacted", "Replied", "Client"];

// Where this company is in your pipeline. Click a step to move it; "Not a fit" parks it.
export default function StatusStepper({ companyId, status }: { companyId: number; status: string }) {
  const toast = useToast();
  const [current, setCurrent] = useState(status);
  const [pending, start] = useTransition();
  const idx = STEPS.indexOf(current);

  function pick(next: string) {
    if (next === current || pending) return;
    const before = current;
    setCurrent(next);
    start(async () => {
      try { await setCompanyStatus(companyId, next); toast(`Marked as ${next}`); }
      catch (err) { setCurrent(before); toast(`Could not change status: ${err instanceof Error ? err.message : err}`, "bad"); }
    });
  }

  return (
    <nav className="stepper" aria-label="Pipeline status">
      <ol>
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => pick(s)} aria-current={s === current ? "step" : undefined}
              className={`step${i < idx ? " done" : ""}${s === current ? " now" : ""}`}>
              <span className="step-dot">{i < idx ? <Check size={12} aria-hidden /> : i + 1}</span> {s}
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className={`secondary park${current === "Not a fit" ? " on" : ""}`} onClick={() => pick(current === "Not a fit" ? "New" : "Not a fit")}>
        {current === "Not a fit" ? "Reopen" : "Not a fit"}
      </button>
    </nav>
  );
}
