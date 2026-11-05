import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

// Starter diagrams live in config/flowchart-templates.yaml, so the owner can edit them and no niche is hard-coded.
export type FlowchartTemplate = { key: string; group: string; title: string; description: string; code: string };

export function parseTemplates(text: string): FlowchartTemplate[] {
  const list = parse(text)?.templates;
  if (!Array.isArray(list)) throw new Error("config/flowchart-templates.yaml needs a templates list");
  return list.map((t: Record<string, unknown>) => {
    for (const k of ["key", "group", "title", "description", "code"]) {
      if (typeof t[k] !== "string" || !(t[k] as string).trim()) throw new Error(`A flowchart template is missing ${k}`);
    }
    return { key: t.key, group: t.group, title: t.title, description: t.description, code: (t.code as string).trimEnd() } as FlowchartTemplate;
  });
}

export const loadTemplates = async () =>
  parseTemplates(await readFile(path.resolve(process.cwd(), "..", "config/flowchart-templates.yaml"), "utf8"));
