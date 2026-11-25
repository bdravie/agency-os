// Run the demo without n8n or Google: the same Code nodes, with the four tabs kept in out/ (git-ignored).
//   node scripts/local.mjs sample [--ai]   start from an empty sheet, load the sample data, play the three Loom steps, print the tabs
//   node scripts/local.mjs seed           start from an empty sheet and load only the sample data (the state before the Loom)
//   node scripts/local.mjs serve  [--ai]   serve the two pages on http://127.0.0.1:5690 with a local stand-in for n8n's webhooks
// --ai drafts follow-ups with Claude Haiku (needs ANTHROPIC_API_KEY; replies are cached in out/cache). Without it, a stand-in note is used.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { handle, resetSheet, loadSheet, aiCalls, SETTINGS } from './engine.mjs';
import { seed, loom } from './story.mjs';

const [cmd = 'sample', ...flags] = process.argv.slice(2);
const useAi = flags.includes('--ai');
const PORT = Number(process.env.PORT || 5690);   // not 5679: n8n's own task runner uses it
const BASE = `http://127.0.0.1:${PORT}/webhook/lead-capture`;
const N8N = 'http://localhost:5678/webhook/lead-capture';
const KEY = SETTINGS.team_key;

const local = async (path, fields) => {
  const [p, qs] = path.split('?');
  return handle({ path: p, base: BASE, useAi, query: Object.fromEntries(new URLSearchParams(qs || '')), body: fields || {} });
};

const table = (rows, cols, width = 26) => {
  const cut = (v) => { const s = String(v ?? '').replace(/\n/g, ' / '); return s.length > width ? s.slice(0, width - 1) + '…' : s.padEnd(width); };
  console.log(cols.map((c) => cut(c)).join(' '));
  for (const r of rows) console.log(cols.map((c) => cut(r[c])).join(' '));
};
const asObjects = (rows) => { const [head, ...rest] = rows.filter((r) => r.some((v) => v !== '')); return head ? rest.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))) : []; };

if (cmd === 'seed') {
  resetSheet();
  await seed(local, KEY, (line) => console.log('  ' + line));
  console.log('\nReady for the Loom steps. Now run: node scripts/local.mjs serve');
} else if (cmd === 'sample') {
  resetSheet();
  console.log('Loading the sample data (before the Loom)\n');
  await seed(local, KEY, (line) => console.log('  ' + line));
  console.log('\nThe three Loom steps\n');
  const d = await loom(local, KEY, (line) => console.log('  ' + line));
  const sheet = loadSheet();
  console.log('\n== Contacts ==');
  table(asObjects(sheet.Contacts), ['email', 'first_name', 'organisation', 'sources', 'stage', 'stage_reason', 'newsletter', 'lawful_basis'], 22);
  console.log('\n== Consent log (last 6 of ' + asObjects(sheet['Consent log']).length + ') ==');
  table(asObjects(sheet['Consent log']).slice(-6), ['logged_at', 'match_key', 'event', 'source', 'wording'], 30);
  console.log('\n== Suppression ==');
  table(asObjects(sheet.Suppression), ['added_at', 'email', 'reason', 'how'], 30);
  console.log('\n== Follow-up drafts ==');
  for (const r of asObjects(sheet['Follow-up drafts'])) console.log(`\n[${r.status}] ${r.first_name}, ${r.organisation}  (${r.why_now})\nSubject: ${r.subject}\n${r.draft}`);
  const c = asObjects(sheet.Contacts);
  console.log(`\n${c.length} contacts from ${new Set(c.flatMap((x) => x.sources.split(', '))).size} sources. Stages: ` + ['Discovered', 'Engaged', 'Identified', 'Opportunity'].map((s) => `${s} ${c.filter((x) => x.stage === s).length}`).join(', ') + '.');
  console.log(`Claude calls: ${aiCalls.live} live, ${aiCalls.cached} from cache, ${aiCalls.offline} offline stand-ins. Tokens this run: ${aiCalls.input_tokens} in, ${aiCalls.output_tokens} out.`);
  console.log('Tabs written to out/*.csv');
} else if (cmd === 'serve') {
  if (!existsSync(new URL('../out/sheet.json', import.meta.url))) resetSheet();
  const SITE = new URL('../site/', import.meta.url);
  const TYPES = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', csv: 'text/csv', svg: 'image/svg+xml' };
  createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    try {
      if (url.pathname.startsWith('/webhook/lead-capture/')) {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = req.method === 'POST' ? Object.fromEntries(new URLSearchParams(raw)) : {};
        const r = await handle({ path: url.pathname.split('/').pop(), base: BASE, useAi, query: Object.fromEntries(url.searchParams), body });
        res.writeHead(200, { 'Content-Type': r.type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
        return res.end(r.body);
      }
      if (url.pathname.startsWith('/sample-data/')) {   // so the team view can load the sample files with one click
        const f = new URL('..' + url.pathname, import.meta.url);
        if (/^\/sample-data\/[\w/-]+\.csv$/.test(url.pathname) && existsSync(f)) { res.writeHead(200, { 'Content-Type': 'text/csv' }); return res.end(readFileSync(f)); }
      }
      const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^[\w-]+\.(html|css|js|svg)$/.test(name) || !existsSync(new URL(name, SITE))) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[name.split('.').pop()] });
      res.end(readFileSync(new URL(name, SITE)));
    } catch (e) {
      console.error(e);
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: false, error: 'The local stand-in failed: ' + e.message }));
    }
  }).on('error', (e) => {
    if (e.code !== 'EADDRINUSE') throw e;
    console.error(`Port ${PORT} is already in use, perhaps by another copy of this command. Stop that one, or pick another port: PORT=5691 node scripts/local.mjs serve`);
    process.exit(1);
  }).listen(PORT, '127.0.0.1', () => {
    const links = (hook) => `  Website:   http://127.0.0.1:${PORT}/?hook=${encodeURIComponent(hook)}\n  Team view: http://127.0.0.1:${PORT}/journey.html?hook=${encodeURIComponent(hook)}`;
    console.log(`With n8n and your Google Sheet:\n${links(N8N)}\n\nWithout n8n (tabs kept in out/*.csv):\n${links(BASE)}\n\nThe page remembers whichever you open last. Ctrl+C to stop.`);
  });
} else {
  console.log('Use: node scripts/local.mjs sample|seed|serve [--ai]');
}
