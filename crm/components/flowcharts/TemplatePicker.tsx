"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import type { FlowchartTemplate } from "@/lib/flowchartTemplates";

// Choosing a template creates the flowchart and opens it. Nothing is saved until one is clicked.
export default function TemplatePicker({ templates }: { templates: FlowchartTemplate[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const groups = [...new Set(templates.map((t) => t.group))];

  const start = async (t: FlowchartTemplate) => {
    setBusy(t.key);
    try {
      const res = await fetch("/api/flowcharts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t.title, code: t.code, theme: "auto" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      router.push(`/flowcharts/${body.flowchart.id}`);
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : "That could not be created.", "bad");
      setBusy(null);
    }
  };

  return (
    <div className="fc stack">
      {groups.map((group) => (
        <section key={group} aria-labelledby={`group-${group}`}>
          <h2 id={`group-${group}`} className="fc-group">{group}</h2>
          <div className="fc-templates">
            {templates.filter((t) => t.group === group).map((t) => (
              <button key={t.key} type="button" className="fc-template card card-link" disabled={busy !== null} onClick={() => start(t)}>
                <strong>{busy === t.key ? "Opening…" : t.title}</strong>
                <span className="muted">{t.description}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
