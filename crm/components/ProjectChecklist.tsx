"use client";

import ToastForm from "./ToastForm";
import { toggleProjectChecklistStepAction } from "@/lib/quickCaptureActions";
import { calculateChecklistProgress, type ProjectChecklistItem } from "@/lib/quickCaptureMath";
import { CheckCircle2, Circle } from "lucide-react";

export default function ProjectChecklist({
  contentItemId,
  checklist,
}: {
  contentItemId: number;
  checklist: ProjectChecklistItem[];
}) {
  const { done, total, percent } = calculateChecklistProgress(checklist);

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14.5 }}>Production checklist</h3>
        <span className="badge" style={{ fontSize: 12 }}>
          {done} of {total} done ({percent}%)
        </span>
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: "100%",
          height: 6,
          backgroundColor: "var(--surface-muted, var(--line-soft))",
          borderRadius: 3,
          overflow: "hidden",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            backgroundColor: percent === 100 ? "var(--good)" : "var(--accent)",
            transition: "width 0.3s ease",
          }}
        />
      </div>

      <div className="stack" style={{ gap: 6 }}>
        {checklist.map((step) => (
          <ToastForm
            key={step.key}
            action={toggleProjectChecklistStepAction}
            success={step.done ? `${step.label} marked pending` : `${step.label} complete`}
            style={{ margin: 0 }}
          >
            <input type="hidden" name="contentItemId" value={contentItemId} />
            <input type="hidden" name="stepKey" value={step.key} />
            <button
              type="submit"
              className="row"
              style={{
                width: "100%",
                padding: "8px 10px",
                background: step.done ? "var(--surface-subtle, rgba(0,0,0,0.02))" : "transparent",
                border: "1px solid var(--line-soft)",
                borderRadius: 6,
                justifyContent: "flex-start",
                gap: 10,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {step.done ? (
                <CheckCircle2 size={16} style={{ color: "var(--good)", flexShrink: 0 }} />
              ) : (
                <Circle size={16} style={{ color: "var(--muted)", flexShrink: 0 }} />
              )}
              <span
                style={{
                  fontSize: 13.5,
                  textDecoration: step.done ? "line-through" : "none",
                  color: step.done ? "var(--muted)" : "var(--fg)",
                  fontWeight: step.done ? 400 : 500,
                }}
              >
                {step.label}
              </span>
            </button>
          </ToastForm>
        ))}
      </div>
    </div>
  );
}
