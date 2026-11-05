"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { TITLE_MAX } from "@/lib/flowchartMath";
import { ago } from "@/lib/format";
import type { FlowchartListRow } from "@/lib/flowchartApi";

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? "That did not work. Try again.");
  return out;
}

export default function FlowchartList({ rows }: { rows: FlowchartListRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [renaming, setRenaming] = useState<number | null>(null);
  const [name, setName] = useState("");

  const act = async (run: () => Promise<unknown>, success: string) => {
    try {
      await run();
      toast(success);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "That did not work. Try again.", "bad");
    }
  };
  const rename = async (id: number) => {
    setRenaming(null);
    await act(() => call(`/api/flowcharts/${id}`, "PATCH", { title: name }), "Renamed");
  };

  return (
    <div className="table-wrap">
      <table className="fc-list">
        <thead><tr><th>Title</th><th>Type</th><th>Updated</th><th className="num"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                {renaming === r.id ? (
                  <form onSubmit={(e) => { e.preventDefault(); void rename(r.id); }}>
                    <input
                      autoFocus value={name} maxLength={TITLE_MAX} aria-label={`New title for ${r.title}`}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Escape") setRenaming(null); }}
                      onBlur={() => setRenaming(null)}
                    />
                  </form>
                ) : <Link href={`/flowcharts/${r.id}`} className="fc-list-title">{r.title}</Link>}
              </td>
              <td className="muted">{r.kind}</td>
              <td className="muted" title={new Date(r.updated_at).toLocaleString("en-GB")}>{ago(r.updated_at)}</td>
              <td className="num">
                <span className="fc-actions">
                  <button type="button" className="icon-btn" aria-label={`Rename ${r.title}`} title="Rename" onClick={() => { setName(r.title); setRenaming(r.id); }}><Pencil size={15} aria-hidden /></button>
                  <button type="button" className="icon-btn" aria-label={`Duplicate ${r.title}`} title="Duplicate" onClick={() => act(() => call(`/api/flowcharts/${r.id}/duplicate`, "POST"), "Duplicated")}><Copy size={15} aria-hidden /></button>
                  <button type="button" className="icon-btn danger" aria-label={`Delete ${r.title}`} title="Delete" onClick={() => { if (window.confirm(`Delete "${r.title}"? This cannot be undone.`)) void act(() => call(`/api/flowcharts/${r.id}`, "DELETE"), "Deleted"); }}><Trash2 size={15} aria-hidden /></button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
