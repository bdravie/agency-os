"use client";

import { useState } from "react";
import ToastForm from "./ToastForm";
import { createCategoryAction, updateCategoryAction, toggleCategoryActiveAction } from "@/lib/categoryActions";
import { BRAND_COLOUR_OPTIONS, type ContentCategory } from "@/lib/categoryTypes";
import { Plus } from "lucide-react";

export default function CategoryManager({ categories }: { categories: ContentCategory[] }) {
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <details className="card" style={{ marginTop: 14 }}>
      <summary style={{ fontWeight: 600, cursor: "pointer" }}>
        Manage categories ({categories.length})
      </summary>
      <div className="stack" style={{ gap: 14, marginTop: 14 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          Categories organize your content niches, pipeline, and analytics. Add new niches, recolour using brand tokens, or retire ones you are no longer publishing to.
        </p>

        {/* Existing categories list */}
        <div className="stack" style={{ gap: 8 }}>
          {categories.map((c) => (
            <div
              key={c.id}
              className="row-between card"
              style={{
                padding: "8px 12px",
                background: "var(--bg)",
                opacity: c.active ? 1 : 0.6,
                borderColor: c.active ? "var(--line)" : "var(--line-soft)",
              }}
            >
              {editingId === c.id ? (
                <ToastForm
                  action={updateCategoryAction}
                  success="Category updated"
                  className="row"
                  style={{ gap: 8, flex: 1 }}
                  onDone={() => setEditingId(null)}
                >
                  <input type="hidden" name="id" value={c.id} />
                  <input
                    name="label"
                    defaultValue={c.label}
                    required
                    style={{ flex: 1, minWidth: 120 }}
                    aria-label="Category name"
                  />
                  <select name="colour" defaultValue={c.colour} aria-label="Colour">
                    {BRAND_COLOUR_OPTIONS.map((col) => (
                      <option key={col.value} value={col.value}>
                        {col.label}
                      </option>
                    ))}
                  </select>
                  <button className="secondary">Save</button>
                  <button type="button" className="link" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </ToastForm>
              ) : (
                <>
                  <span className="row" style={{ gap: 8 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: c.colour,
                        flexShrink: 0,
                      }}
                    />
                    <b>{c.label}</b>
                    <span className="muted" style={{ fontSize: 12 }}>({c.key})</span>
                    {!c.active && <span className="badge tone-neutral">Retired</span>}
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="link"
                      onClick={() => setEditingId(c.id)}
                    >
                      Edit
                    </button>
                    <ToastForm action={toggleCategoryActiveAction} success={c.active ? "Category retired" : "Category reinstated"}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="active" value={String(c.active)} />
                      <button className="link" style={{ color: c.active ? "var(--muted)" : "var(--accent)" }}>
                        {c.active ? "Retire" : "Reinstate"}
                      </button>
                    </ToastForm>
                  </span>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add category form */}
        <ToastForm
          action={createCategoryAction}
          success="Category created"
          reset
          className="row"
          style={{ gap: 8, marginTop: 4, flexWrap: "wrap" }}
        >
          <input
            name="label"
            placeholder="New category name (e.g. Solar)"
            required
            style={{ flex: 1, minWidth: 160 }}
            aria-label="New category name"
          />
          <select name="colour" defaultValue="var(--accent)" aria-label="Colour">
            {BRAND_COLOUR_OPTIONS.map((col) => (
              <option key={col.value} value={col.value}>
                {col.label}
              </option>
            ))}
          </select>
          <button className="secondary">
            <Plus size={15} aria-hidden /> Add category
          </button>
        </ToastForm>
      </div>
    </details>
  );
}
