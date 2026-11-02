import Anthropic from "@anthropic-ai/sdk";

// Model choice lives here (mirrors src/agency/llm.py).
export const MODELS = { opus: "claude-opus-5-5", sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-5-5" } as const;

const g = globalThis as unknown as { _anthropic?: Anthropic };

/** A short alias (opus/sonnet/haiku) or a full model id, so a model can be chosen from an environment variable. */
export type ModelChoice = keyof typeof MODELS | (string & {});
const resolve = (m: ModelChoice) => (MODELS as Record<string, string>)[m] ?? m;

/** The model for audit reports: set AUDIT_MODEL in .env (an alias like "opus" or a full model id). Defaults to Sonnet. */
export const auditModel = () => resolve(process.env.AUDIT_MODEL?.trim() || "sonnet");

/** The model for call analysis: set CALLS_MODEL in .env (an alias or a full model id). Defaults to Sonnet. */
export const callsModel = () => resolve(process.env.CALLS_MODEL?.trim() || "sonnet");

/** The model for client results reports and case studies: set OUTCOMES_MODEL in .env (an alias or a full model id). Defaults to Sonnet. */
export const outcomesModel = () => resolve(process.env.OUTCOMES_MODEL?.trim() || "sonnet");

/** The model for offer suggestions: set SUGGEST_MODEL in .env (an alias or a full model id). Defaults to Sonnet. */
export const suggestModel = () => resolve(process.env.SUGGEST_MODEL?.trim() || "sonnet");

/** The model for Instagram DM drafts: set DM_MODEL in .env (an alias or a full model id). Defaults to Haiku, since these are short. */
export const dmModel = () => resolve(process.env.DM_MODEL?.trim() || "haiku");

/** The model for Upwork pitch packs: set UPWORK_MODEL in .env (an alias or a full model id). Defaults to Sonnet. */
export const upworkModel = () => resolve(process.env.UPWORK_MODEL?.trim() || "sonnet");

/** The model for content insights and other content tasks: set CONTENT_MODEL in .env (an alias or a full model id). Defaults to Haiku, since it only words numbers the code already worked out. */
export const contentModel = () => resolve(process.env.CONTENT_MODEL?.trim() || "haiku");

/** The model for rapport research on decision-makers: set RAPPORT_MODEL in .env (an alias or a full model id). Defaults to Sonnet, since it must judge sources carefully. */
export const rapportModel = () => resolve(process.env.RAPPORT_MODEL?.trim() || "sonnet");

/** The model for writing niche outreach copy: set OUTREACH_MODEL in .env (an alias or a full model id). Defaults to Sonnet. */
export const outreachModel = () => resolve(process.env.OUTREACH_MODEL?.trim() || "sonnet");

export async function ask(prompt: string, model: ModelChoice = "sonnet", maxTokens = 1500): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  g._anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await g._anthropic.messages.create({
    model: resolve(model), max_tokens: maxTokens, messages: [{ role: "user", content: prompt }],
  });
  return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
}

type Schema = Anthropic.Tool["input_schema"];

/** Ask for structured data: the model must call one tool, so the result is already parsed (no JSON text to break). Forcing tool_choice is not supported on every model, so we instruct instead. */
export async function askStructured<T>(prompt: string, schema: Schema, model: ModelChoice = "sonnet", maxTokens = 1500): Promise<T> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  g._anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await g._anthropic.messages.create({
    model: resolve(model), max_tokens: maxTokens, messages: [{ role: "user", content: `${prompt}\n\nWhen finished, call the submit tool with your complete result. Do not reply in plain text.` }],
    tools: [{ name: "submit", description: "Submit the finished result.", input_schema: schema }],
  });
  if (res.stop_reason === "max_tokens") throw new Error(`The AI reply was cut off (it used all ${maxTokens} tokens on ${resolve(model)} before finishing). Try again, or use a shorter input.`);
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("The AI did not return a result. Try again.");
  return block.input as T;
}
