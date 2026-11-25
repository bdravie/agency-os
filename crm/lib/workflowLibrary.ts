// The owner's own saved workflows (n8n exports and Make blueprints they uploaded). Only the parsed outline is stored.
import { query } from "./db.ts";
import { cleanParsed, type ParsedWorkflow, type Platform } from "./workflowParse.ts";

export type LibraryWorkflow = { id: number; name: string; platform: Platform; solves: string | null; tags: string[]; apps: string[]; workflow: ParsedWorkflow };

type Row = Omit<LibraryWorkflow, "workflow"> & { workflow: unknown };
const tidy = (rows: Row[]): LibraryWorkflow[] => rows.flatMap((r) => { const workflow = cleanParsed(r.workflow); return workflow ? [{ ...r, workflow }] : []; });

export const loadLibrary = async () => tidy(await query<Row>(`SELECT id::int AS id, name, platform, solves, tags, apps, workflow FROM workflow_library ORDER BY name`));
export const loadLibraryWorkflow = async (id: number) => tidy(await query<Row>(`SELECT id::int AS id, name, platform, solves, tags, apps, workflow FROM workflow_library WHERE id = $1`, [id]))[0] ?? null;
