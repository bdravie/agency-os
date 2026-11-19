// The only place the demo talks to Claude. Replies are cached on disk (keyed on model, prompt and input),
// so re-running the same question while developing or rehearsing the Loom costs nothing.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { DEMO_DIR } from "./store";

const ROOT = process.env.SUPPORT_DEMO_ROOT ?? path.resolve(DEMO_DIR, "../..");
const CACHE = path.join(ROOT, ".cache", "support-chatbot");

/** Haiku by default: answers are short and come from articles already chosen by the search. Override with SUPPORT_DEMO_MODEL. */
export const MODEL = process.env.SUPPORT_DEMO_MODEL?.trim() || "claude-haiku-5-5";
export const SHOP = "Thistledown Home";

export const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY) && process.env.SUPPORT_DEMO_NO_LLM !== "1";

export function prompt(name: "answer" | "summary", vars: Record<string, string>): string {
  const text = fs.readFileSync(path.join(DEMO_DIR, "prompts", `${name}.md`), "utf8");
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}

export type Usage = { input_tokens: number; output_tokens: number };
export type AskResult<T> = { data: T; cached: boolean; usage: Usage };

let client: Anthropic | undefined;

/** One structured call: the reply must match `schema` (structured outputs), so there is no free text to parse. */
export async function askJson<T>(system: string, user: string, schema: Record<string, unknown>, fresh = false): Promise<AskResult<T>> {
  const key = crypto.createHash("sha256").update(JSON.stringify([MODEL, system, user, schema])).digest("hex").slice(0, 24);
  const file = path.join(CACHE, `${key}.json`);
  if (!fresh && fs.existsSync(file)) {
    const hit = JSON.parse(fs.readFileSync(file, "utf8")) as { data: T; usage: Usage };
    return { data: hit.data, usage: hit.usage, cached: true };
  }

  client ??= new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort: "low", format: { type: "json_schema", schema } },
  });
  if (res.stop_reason === "refusal") throw new Error("Claude declined this request.");
  if (res.stop_reason === "max_tokens") throw new Error("Claude's reply was cut off.");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const data = JSON.parse(text) as T;
  const usage = { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens };

  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ model: MODEL, at: new Date().toISOString(), data, usage }, null, 2));
  return { data, usage, cached: false };
}
