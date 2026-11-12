import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

function getRoot(): string {
  if (existsSync(path.join(process.cwd(), "prompts"))) return process.cwd();
  const parent = path.resolve(process.cwd(), "..");
  if (existsSync(path.join(parent, "prompts"))) return parent;
  return process.cwd();
}

/** prompts/positioning.md: how the consultant describes what they do (results for the business, not the technology). */
export const positioning = () => readFile(path.join(getRoot(), "prompts/positioning.md"), "utf8");

/** Put the positioning in front of a prompt whose output a prospect, client or audience will read. */
export async function withPositioning(prompt: string): Promise<string> {
  return `${await positioning()}\n\n${prompt}`;
}
