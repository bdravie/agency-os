import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "..");

/** prompts/positioning.md: how the consultant describes what they do (results for the business, not the technology). */
export const positioning = () => readFile(path.join(ROOT, "prompts/positioning.md"), "utf8");

/** Put the positioning in front of a prompt whose output a prospect, client or audience will read. */
export async function withPositioning(prompt: string): Promise<string> {
  return `${await positioning()}\n\n${prompt}`;
}
