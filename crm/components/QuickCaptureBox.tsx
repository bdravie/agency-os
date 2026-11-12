"use client";

import { useState } from "react";
import ToastForm from "./ToastForm";
import { saveQuickCaptureAction } from "@/lib/quickCaptureActions";
import { Sparkles, AlertTriangle } from "lucide-react";

const EMAIL_CHECK = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_CHECK = /(?:\+44\s?\(?0?\)?\s?|\b0)\d[\d\s-]{8,12}\d/;

export default function QuickCaptureBox({ style }: { style?: React.CSSProperties }) {
  const [note, setNote] = useState("");
  const hasEmail = EMAIL_CHECK.test(note);
  const hasPhone = PHONE_CHECK.test(note);
  const blocked = hasEmail || hasPhone;

  return (
    <div className="card" style={{ padding: 18, background: "var(--surface)", ...style }}>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <Sparkles size={16} style={{ color: "var(--accent)" }} aria-hidden />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Quick capture note</h3>
        </div>
        <span className="badge tone-neutral" style={{ fontSize: 11 }}>
          Auto-categorised on save
        </span>
      </div>

      <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
        Dump a video concept, rough thought, or voice transcript. Categorised automatically into a project on save. Business observations only.
      </p>

      {blocked && (
        <div
          role="alert"
          className="card"
          style={{
            padding: "8px 12px",
            marginBottom: 10,
            background: "rgba(255, 107, 91, 0.12)",
            borderColor: "var(--accent)",
            color: "var(--fg)",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <AlertTriangle size={15} style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden />
          <span>
            {hasEmail && "Email addresses are refused per privacy rules. Please remove it before saving."}
            {hasPhone && !hasEmail && "Phone numbers are refused per privacy rules. Please remove it before saving."}
          </span>
        </div>
      )}

      <ToastForm
        action={saveQuickCaptureAction}
        success="Video idea captured and categorised into a project"
        reset
        onDone={() => setNote("")}
        className="stack"
        style={{ gap: 10 }}
      >
        <textarea
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. 3 reasons why commercial roofers lose weekend enquiries on WhatsApp. Contrast voice note chaos with a structured lead intake form..."
          rows={3}
          required
          aria-label="Quick-capture video note"
          style={{ width: "100%", fontSize: 13.5, resize: "vertical" }}
        />
        <div className="row-between">
          <span className="muted" style={{ fontSize: 12 }}>
            {note.length > 0 && `${note.length} characters`}
          </span>
          <button
            type="submit"
            disabled={!note.trim() || blocked}
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--on-accent)",
              fontWeight: 600,
              padding: "6px 14px",
              opacity: !note.trim() || blocked ? 0.5 : 1,
            }}
          >
            Save &amp; organise
          </button>
        </div>
      </ToastForm>
    </div>
  );
}
