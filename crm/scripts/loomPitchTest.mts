// Runs the Loom pitch on a job file without saving anything to the proposals table, and prints the full result. Reads your profile and proof from the database.
// Usage (from crm/):  node --experimental-strip-types --no-warnings --env-file=../.env scripts/loomPitchTest.mts <job.txt> [out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { buildLoomPitch } from "../lib/loomPitch.ts";
import { loadPitchContext } from "../lib/pitchLibrary.ts";

const [file, out] = process.argv.slice(2);
if (!file) { console.error("Give the path of a text file holding the job post."); process.exit(2); }
const c = await loadPitchContext(readFileSync(file, "utf8").trim(), { budget: "", screening_questions: [], client_name: "", client_info: "" });
const pitch = await buildLoomPitch(c);
const json = JSON.stringify(pitch, null, 2);
if (out) writeFileSync(out, json);
console.log(json);
process.exit(0);
