"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { addContactMethodAction, removeContactMethodAction } from "@/lib/contactMethodActions";
import { METHOD_KINDS, methodHref, methodLabel } from "@/lib/contactMethods";
import { useToast } from "./Toast";

export type SavedMethod = { id: number; kind: string; value: string; note: string | null };
export type MethodDraft = { kind: string; value: string; note: string };
export const EMPTY_DRAFT: MethodDraft = { kind: "tiktok", value: "", note: "" };

// More ways to reach a company than the main boxes hold: TikTok and other social pages, a second email or phone, WhatsApp. Pick the type, then add.
// The typed-in entry is controlled by the parent, so the form's Save button can save it too.
export default function ContactMethods({ companyId, methods, draft, onDraft }: { companyId: number; methods: SavedMethod[]; draft: MethodDraft; onDraft: (d: MethodDraft) => void }) {
  const toast = useToast(), router = useRouter();
  const { kind, value, note } = draft;
  const setKind = (k: string) => onDraft({ ...draft, kind: k }), setValue = (v: string) => onDraft({ ...draft, value: v }), setNote = (n: string) => onDraft({ ...draft, note: n });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const groups = [...new Set(METHOD_KINDS.map((m) => m.group))];
  const placeholder = METHOD_KINDS.find((m) => m.code === kind)?.placeholder ?? "";

  const add = () => start(async () => {
    setError(null);
    const r = await addContactMethodAction(companyId, kind, value, note);
    if (r.error) { setError(r.error); return; }
    onDraft({ ...draft, value: "", note: "" }); toast(`${methodLabel(kind)} added`); router.refresh();
  });
  const remove = (id: number) => start(async () => {
    const fd = new FormData(); fd.set("id", String(id));
    const r = await removeContactMethodAction(fd);
    if (r && r.error) toast(r.error, "bad"); else { toast("Removed"); router.refresh(); }
  });

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="field-label">More contact methods</div>
      {methods.length > 0 && (
        <ul style={{ margin: 0 }}>{methods.map((m) => {
          const href = methodHref(m.kind, m.value);
          return (
            <li key={m.id} className="row" style={{ gap: 8, border: 0, padding: "3px 0" }}>
              <b style={{ minWidth: 150 }}>{methodLabel(m.kind)}</b>
              {href ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{m.value.replace(/^https?:\/\/(www\.)?/, "")}</a> : <span>{m.value}</span>}
              {m.note && <span className="muted">{m.note}</span>}
              <button type="button" className="link" disabled={pending} onClick={() => remove(m.id)} aria-label={`Remove ${methodLabel(m.kind)}`}><Trash2 size={14} aria-hidden /></button>
            </li>
          );
        })}</ul>
      )}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <select value={kind} onChange={(e) => { setKind(e.target.value); setError(null); }} aria-label="Type of contact method">
          {groups.map((g) => <optgroup key={g} label={g}>{METHOD_KINDS.filter((m) => m.group === g).map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}</optgroup>)}
        </select>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} style={{ flex: 1, minWidth: 200 }} aria-label="Address, number or link"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (value.trim()) add(); } }} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" maxLength={80} style={{ width: 160 }} aria-label="Note" />
        <button type="button" className="secondary" disabled={pending || !value.trim()} onClick={add}><Plus size={15} aria-hidden /> Add contact method</button>
      </div>
      {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <p className="muted" style={{ margin: 0 }}>Company pages and generic inboxes only. These are for you to reach them by hand: the CRM never messages anyone.</p>
    </div>
  );
}
