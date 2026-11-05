import { query } from "./db";
import { diagramKind, likePattern, type FlowchartFields } from "./flowchartMath";
import type { FlowchartListRow, FlowchartRow, FlowchartStore } from "./flowchartApi";

const COLUMNS = `id::float8 AS id, title, code, theme, created_at, updated_at, updated_at::text AS version`;

export const flowchartStore: FlowchartStore = {
  async list(q) {
    const rows = await query<FlowchartRow & { head: string }>(
      `SELECT id::float8 AS id, title, theme, created_at, updated_at, updated_at::text AS version, left(code, 500) AS head
         FROM flowcharts
        WHERE $1 = '' OR title ILIKE $2 OR code ILIKE $2
        ORDER BY updated_at DESC LIMIT 500`, [q, likePattern(q)]);
    return rows.map(({ head, ...r }): FlowchartListRow => ({ ...r, kind: diagramKind(head) }));
  },
  async get(id) {
    const [row] = await query<FlowchartRow>(`SELECT ${COLUMNS} FROM flowcharts WHERE id = $1`, [id]);
    return row ?? null;
  },
  async create(f: FlowchartFields) {
    const [row] = await query<FlowchartRow>(`INSERT INTO flowcharts (title, code, theme) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`, [f.title, f.code, f.theme]);
    return row;
  },
  async update(id, f, baseVersion) {
    const [row] = await query<FlowchartRow>(
      `UPDATE flowcharts SET title = COALESCE($2, title), code = COALESCE($3, code), theme = COALESCE($4, theme)
        WHERE id = $1 AND ($5::timestamptz IS NULL OR updated_at = $5::timestamptz)
        RETURNING ${COLUMNS}`, [id, f.title ?? null, f.code ?? null, f.theme ?? null, baseVersion ?? null]);
    if (row) return { row };
    const current = await this.get(id);
    return current ? { conflict: current } : null;
  },
  async remove(id) {
    return (await query(`DELETE FROM flowcharts WHERE id = $1 RETURNING id`, [id])).length > 0;
  },
};
