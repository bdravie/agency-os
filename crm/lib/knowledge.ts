import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { buildIndex, chunkMarkdown, type KnowledgeIndex } from "./knowledgeMath";

// Reads config/knowledge.yaml and the Markdown files it lists, and keeps the keyword index in memory until a file changes.

export type KnowledgeTopic = { key: string; label: string; description: string };
type Config = { topics: (KnowledgeTopic & { sources: string[] })[]; perQuestion: number };

function root(): string {
  if (existsSync(path.join(process.cwd(), "config", "knowledge.yaml"))) return process.cwd();
  return path.resolve(process.cwd(), "..");
}

async function loadConfig(): Promise<Config> {
  const y = parse(await readFile(path.join(root(), "config", "knowledge.yaml"), "utf8")) ?? {};
  const topics = Object.entries((y.topics ?? {}) as Record<string, { label?: string; description?: string; sources?: string[] }>).map(([key, t]) => ({
    key,
    label: String(t?.label ?? key),
    description: String(t?.description ?? ""),
    sources: Array.isArray(t?.sources) ? t.sources.map(String) : [],
  }));
  const perQuestion = Math.min(Math.max(Number(y.passages_per_question) || 8, 2), 16);
  return { topics, perQuestion };
}

/** The topics for the picker (no file paths). */
export async function knowledgeTopics(): Promise<KnowledgeTopic[]> {
  try { return (await loadConfig()).topics.map(({ key, label, description }) => ({ key, label, description })); }
  catch { return []; }
}

/** Expands `folder/*.md` and keeps only Markdown files inside the repo. Missing files are skipped, not fatal. */
async function expand(source: string): Promise<string[]> {
  const base = root();
  const full = path.resolve(base, source.replace(/\/\*\.md$/, ""));
  if (!full.startsWith(base + path.sep)) return [];
  if (source.endsWith("/*.md")) {
    try {
      return (await readdir(full)).filter((f) => f.endsWith(".md") && !f.startsWith("._")).sort().map((f) => path.join(full, f));
    } catch { return []; }
  }
  return full.endsWith(".md") && existsSync(full) ? [full] : [];
}

const g = globalThis as unknown as { _knowledge?: { key: string; index: KnowledgeIndex; perQuestion: number } };

/** The index over every listed file, rebuilt only when a file or the config changes. */
export async function knowledgeIndex(): Promise<{ index: KnowledgeIndex; perQuestion: number; files: number }> {
  const cfg = await loadConfig();
  const base = root();
  const files: { topic: string; file: string; mtime: number }[] = [];
  for (const t of cfg.topics) {
    for (const src of t.sources) {
      for (const file of await expand(src)) files.push({ topic: t.key, file, mtime: (await stat(file)).mtimeMs });
    }
  }
  const cfgTime = (await stat(path.join(base, "config", "knowledge.yaml"))).mtimeMs;
  const key = `${cfgTime}|${files.map((f) => `${f.topic}:${f.file}:${f.mtime}`).join("|")}`;
  if (g._knowledge?.key !== key) {
    const passages = [];
    for (const f of files) passages.push(...chunkMarkdown(path.relative(base, f.file), f.topic, await readFile(f.file, "utf8")));
    g._knowledge = { key, index: buildIndex(passages), perQuestion: cfg.perQuestion };
  }
  return { index: g._knowledge.index, perQuestion: g._knowledge.perQuestion, files: files.length };
}
