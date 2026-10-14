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
