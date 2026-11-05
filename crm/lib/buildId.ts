import { readFileSync } from "node:fs";
import path from "node:path";

let cached: string | null = null;

/** Which build this server is running, so an open tab can tell when the CRM has been updated underneath it. */
export function buildId(): string {
  if (cached) return cached;
  try { cached = readFileSync(path.join(process.cwd(), process.env.NEXT_DIST_DIR || ".next", "BUILD_ID"), "utf8").trim(); }
  catch { cached = "development"; }
  return cached;
}
