// Optional background check for replies, so a Mac notification can appear even when no CRM tab is open.
// Run by launchd every few minutes (see scripts/com.agencyos.replies.plist). Reads only threads the CRM started, like the app does.
// Usage (from crm/):  npx tsx --env-file=../.env scripts/checkReplies.mts
import { execFile } from "node:child_process";
import { checkReplies } from "../lib/replies.ts";

const clean = (s: string) => s.replace(/[\r\n]+/g, " ").slice(0, 200);
const { added, errors } = await checkReplies();
for (const r of added) {
  const title = r.optOut ? `Reply from ${r.from} (looks like an opt-out)` : `New reply from ${r.from}`;
  execFile("osascript", ["-e", `display notification ${JSON.stringify(clean(`${r.company}: ${r.snippet}`))} with title ${JSON.stringify(clean(title))} sound name "Glass"`], () => {});
}
console.log(`${new Date().toISOString()} ${added.length} new repl${added.length === 1 ? "y" : "ies"}${errors.length ? `, ${errors.length} error(s): ${errors.join(" | ")}` : ""}`);
setTimeout(() => process.exit(errors.length ? 1 : 0), 1500);   // let the notifications go out first
