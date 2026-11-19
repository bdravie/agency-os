// Demo storage: small JSON files in data/ (git-ignored), seeded from sample-data/ the first time.
// A real build would keep articles in the client's help-centre tool or a database, and tickets in their help desk.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Article, Flow, Ticket, Unanswered } from "./types";

export const DEMO_DIR = process.cwd();
// SUPPORT_DEMO_DATA lets the eval script use a throwaway folder, so test runs never add rows to the staff page.
const DATA = process.env.SUPPORT_DEMO_DATA || path.join(DEMO_DIR, "data");
const SAMPLE = path.join(DEMO_DIR, "sample-data");

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Written to a temporary file and renamed, so a crash never leaves half a file. */
function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

const articlesFile = path.join(DATA, "articles.json");
const ticketsFile = path.join(DATA, "tickets.json");
const unansweredFile = path.join(DATA, "unanswered.json");

export function sampleArticles(): Article[] {
  return readJson<{ articles: Article[] }>(path.join(SAMPLE, "articles.json"), { articles: [] }).articles;
}

/** Read on every request, so an article saved on the staff page is used by the very next question. */
export function loadArticles(): Article[] {
  if (!fs.existsSync(articlesFile)) writeJson(articlesFile, sampleArticles());
  return readJson<Article[]>(articlesFile, []);
}

export function saveArticle(a: Article): Article {
  const all = loadArticles();
  const saved = { ...a, updatedAt: new Date().toISOString(), updatedBy: "Support team (demo)" };
  const i = all.findIndex((x) => x.id === a.id);
  if (i >= 0) all[i] = saved;
  else all.push(saved);
  writeJson(articlesFile, all);
  return saved;
}

export function loadFlows(): Flow[] {
  return readJson<{ flows: Flow[] }>(path.join(SAMPLE, "flows.json"), { flows: [] }).flows;
}

export function loadTickets(): Ticket[] {
  return readJson<Ticket[]>(ticketsFile, []);
}

export function addTicket(t: Omit<Ticket, "id" | "createdAt">): Ticket {
  const all = loadTickets();
  const next = all.reduce((m, x) => Math.max(m, Number(x.id.replace(/\D/g, "")) || 0), 1000) + 1;
  const ticket: Ticket = { ...t, id: `T-${next}`, createdAt: new Date().toISOString() };
  writeJson(ticketsFile, [ticket, ...all]);
  return ticket;
}

export function updateTicket(id: string, patch: Partial<Ticket>) {
  const all = loadTickets().map((t) => (t.id === id ? { ...t, ...patch } : t));
  writeJson(ticketsFile, all);
}

export function loadUnanswered(): Unanswered[] {
  return readJson<Unanswered[]>(unansweredFile, []);
}

export function logUnanswered(u: Omit<Unanswered, "id" | "at" | "status">) {
  const all = loadUnanswered();
  // The same open question twice is one gap, not two rows.
  const same = all.find((x) => x.status === "open" && x.question.toLowerCase() === u.question.toLowerCase());
  if (same) return same;
  const row: Unanswered = { ...u, id: crypto.randomUUID().slice(0, 8), at: new Date().toISOString(), status: "open" };
  writeJson(unansweredFile, [row, ...all]);
  return row;
}

export function setUnansweredStatus(id: string, status: Unanswered["status"]) {
  writeJson(unansweredFile, loadUnanswered().map((u) => (u.id === id ? { ...u, status } : u)));
}

/** npm run reset: back to the sample articles, no tickets, no unanswered questions. */
export function resetDemo() {
  fs.rmSync(DATA, { recursive: true, force: true });
  loadArticles();
}
