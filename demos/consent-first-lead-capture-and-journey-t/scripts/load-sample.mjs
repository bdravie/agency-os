// Loads the sample data into the real workflow (n8n + your Google Sheet), so the Loom starts from a full list.
// Run on the Mac, with n8n running and the workflow published:
//   node demos/consent-first-lead-capture-and-journey-t/scripts/load-sample.mjs [--url http://localhost:5678/webhook/lead-capture] [--key demo-team-key] [--loom]
// --loom also plays the three Loom steps (to check everything works before recording; empty the tabs afterwards).
// 30 requests, each one Sheets read and at most one write, spaced out to stay inside Google's 60 a minute per user.
import { seed, loom } from './story.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const BASE = arg('--url', 'http://localhost:5678/webhook/lead-capture').replace(/\/+$/, '');
const KEY = arg('--key', 'demo-team-key');
const GAP_MS = 1100;

const call = async (path, fields) => {
  await new Promise((r) => setTimeout(r, GAP_MS));
  const res = fields
    ? await fetch(`${BASE}/${path}`, { method: 'POST', body: new URLSearchParams(fields) })
    : await fetch(`${BASE}/${path}`);
  const body = await res.text();
  if (!res.ok) throw new Error(`${path.split('?')[0]}: HTTP ${res.status} ${body.slice(0, 200)}`);
  return { type: res.headers.get('content-type') || '', body };
};

try {
  console.log(`Loading the sample data into ${BASE}\n`);
  await seed(call, KEY, (line) => console.log('  ' + line));
  if (process.argv.includes('--loom')) { console.log(''); await loom(call, KEY, (line) => console.log('  ' + line)); }
  console.log('\nDone. Open the sheet, then the team view.');
} catch (e) {
  const hint = / HTTP 500 /.test(e.message)
    ? 'n8n answered, so it is running and published, but a step failed. In n8n open the workflow, then Executions, and click the top red one: the red node says why. Usual causes: the Google credential not picked on both sheet nodes (publish again after picking it), the Google Sheets API not enabled, or a tab not named exactly as in the README.'
    : 'Is n8n running and the workflow published? See the README.';
  console.error(`\nStopped: ${e.message}\n${hint}`);
  process.exit(1);
}
