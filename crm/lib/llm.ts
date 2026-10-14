import Anthropic from "@anthropic-ai/sdk";

// Model choice lives here (mirrors src/agency/llm.py).
export const MODELS = { opus: "claude-opus-5-5", sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-5-5" } as const;

const g = globalThis as unknown as { _anthropic?: Anthropic };

export async function ask(prompt: string, model: keyof typeof MODELS = "sonnet", maxTokens = 1500): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  g._anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await g._anthropic.messages.create({
    model: MODELS[model], max_tokens: maxTokens, messages: [{ role: "user", content: prompt }],
  });
  return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
}

type Schema = Anthropic.Tool["input_schema"];

/** Ask for structured data: the model must call one tool, so the result is already parsed (no JSON text to break). */
export async function askStructured<T>(prompt: string, schema: Schema, model: keyof typeof MODELS = "sonnet", maxTokens = 1500): Promise<T> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  g._anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await g._anthropic.messages.create({
    model: MODELS[model], max_tokens: maxTokens, messages: [{ role: "user", content: prompt }],
    tools: [{ name: "submit", description: "Submit the finished result.", input_schema: schema }],
    tool_choice: { type: "tool", name: "submit" },
  });
  if (res.stop_reason === "max_tokens") throw new Error("The AI reply was cut off. Try again, or use a shorter input.");
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("The AI did not return a result. Try again.");
  return block.input as T;
}
