// What each flowchart API route does, apart from HTTP and the database, so it can be tested with a fake store. Login is checked in flowchartHttp.ts.
import { BODY_MAX, checkFlowchartFields, copyTitle, isVersion, parseFlowchartId, type FlowchartFields, type FlowchartTheme } from "./flowchartMath.ts";

export type FlowchartRow = { id: number; title: string; code: string; theme: FlowchartTheme; created_at: string; updated_at: string; version: string };
export type FlowchartListRow = Omit<FlowchartRow, "code"> & { kind: string };
export type UpdateResult = { row: FlowchartRow } | { conflict: FlowchartRow } | null;

export interface FlowchartStore {
  list(q: string): Promise<FlowchartListRow[]>;
  get(id: number): Promise<FlowchartRow | null>;
  create(fields: FlowchartFields): Promise<FlowchartRow>;
  /** Null when there is no such flowchart. With `baseVersion`, a row that has moved on since is returned as a conflict and left alone. */
  update(id: number, fields: Partial<FlowchartFields>, baseVersion?: string): Promise<UpdateResult>;
  remove(id: number): Promise<boolean>;
}

export type Reply = { status: number; body: Record<string, unknown> };
const fail = (status: number, error: string): Reply => ({ status, body: { error } });
const NOT_FOUND = fail(404, "That flowchart no longer exists.");

function parseBody(text: string): { ok: true; value: unknown } | { ok: false; reply: Reply } {
  if (text.length > BODY_MAX) return { ok: false, reply: fail(413, "That is too large to save.") };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reply: fail(400, "That could not be read.") };
  }
}

export async function listFlowcharts(store: FlowchartStore, q: string | null): Promise<Reply> {
  return { status: 200, body: { flowcharts: await store.list((q ?? "").trim().slice(0, 200)) } };
}

export async function createFlowchart(store: FlowchartStore, text: string): Promise<Reply> {
  const body = parseBody(text);
  if (!body.ok) return body.reply;
  const fields = checkFlowchartFields(body.value);
  if (!fields.ok) return fail(400, fields.error);
  return { status: 201, body: { flowchart: await store.create(fields.value as FlowchartFields) } };
}

export async function loadFlowchart(store: FlowchartStore, rawId: unknown): Promise<Reply> {
  const id = parseFlowchartId(rawId);
  const row = id && (await store.get(id));
  return row ? { status: 200, body: { flowchart: row } } : NOT_FOUND;
}

export async function saveFlowchart(store: FlowchartStore, rawId: unknown, text: string): Promise<Reply> {
  const id = parseFlowchartId(rawId);
  if (!id) return NOT_FOUND;
  const body = parseBody(text);
  if (!body.ok) return body.reply;
  const fields = checkFlowchartFields(body.value, true);
  if (!fields.ok) return fail(400, fields.error);
  if (!Object.keys(fields.value).length) return fail(400, "Nothing to save.");
  const base = (body.value as { baseVersion?: unknown }).baseVersion;
  if (base !== undefined && !isVersion(base)) return fail(400, "That could not be read.");
  const result = await store.update(id, fields.value, base);
  if (!result) return NOT_FOUND;
  if ("conflict" in result) return { status: 409, body: { error: "This flowchart changed somewhere else.", flowchart: result.conflict } };
  return { status: 200, body: { flowchart: result.row } };
}

export async function deleteFlowchart(store: FlowchartStore, rawId: unknown): Promise<Reply> {
  const id = parseFlowchartId(rawId);
  return id && (await store.remove(id)) ? { status: 200, body: { deleted: id } } : NOT_FOUND;
}

export async function duplicateFlowchart(store: FlowchartStore, rawId: unknown): Promise<Reply> {
  const id = parseFlowchartId(rawId);
  const row = id && (await store.get(id));
  if (!row) return NOT_FOUND;
  return { status: 201, body: { flowchart: await store.create({ title: copyTitle(row.title), code: row.code, theme: row.theme }) } };
}

/** A cross-site page must not be able to write. No Origin header means it is not a cross-site browser request; `allowed` is this server's own host. */
export const sameOrigin = (origin: string | null, allowed: (string | null)[]) => {
  if (!origin) return true;
  try {
    return allowed.includes(new URL(origin).host);
  } catch {
    return false;
  }
};
