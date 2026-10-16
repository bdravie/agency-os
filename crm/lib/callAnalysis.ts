import { readFile } from "node:fs/promises";
import path from "node:path";
import { askStructured, callsModel } from "./llm";
import { normaliseAnalysis, type RawAnalysis } from "./callNormalise";

const S = { type: "string" } as const;
const Q = { type: ["string", "null"] } as const;
const SCHEMA = {
  type: "object", required: ["summary", "pains", "budget_signals", "objections", "next_step", "follow_up_date"],
  properties: {
    summary: S,
    pains: { type: "array", items: { type: "object", required: ["pain"], properties: { pain: S, quote: Q } } },
    budget_signals: { type: "array", items: { type: "object", required: ["signal"], properties: { signal: S, quote: Q } } },
    objections: { type: "array", items: { type: "object", required: ["name"], properties: { name: S, quote: Q } } },
    next_step: Q, follow_up_date: Q,
  },
} as const;

export async function analyseTranscript(i: { transcript: string; source: string; library: string[]; callDate: string; client: string }) {
  const rules = await readFile(path.join(path.resolve(process.cwd(), ".."), "prompts", "call-analysis.md"), "utf8");
  const weekday = new Date(`${i.callDate}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  const prompt = [
    rules,
    `CALL DATE: ${i.callDate} (${weekday})`,
    `CLIENT: ${i.client}`,
    `EXISTING OBJECTIONS:\n${i.library.length ? i.library.map((n) => `- ${n}`).join("\n") : "(none yet)"}`,
    `${i.source === "notes" ? "THE CONSULTANT'S NOTES" : "TRANSCRIPT"}:\n${i.transcript}`,
  ].join("\n\n");
  const model = callsModel();
  const raw = await askStructured<RawAnalysis>(prompt, SCHEMA as never, model, 4000);
  return { ...normaliseAnalysis(raw, i.transcript, i.library, i.callDate), model };
}
