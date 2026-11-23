// A local stand-in for n8n and Google Sheets. It runs the Code nodes from the built workflow file exactly as n8n would
// (with $input, $() and the Settings node faked) and keeps the four tabs in out/sheet.json, written out as CSV files too.
// Claude: a real call (Haiku) only when ANTHROPIC_API_KEY is set and ai is on, cached in out/cache so a rerun is free.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const DEMO = new URL('..', import.meta.url);
const OUT = process.env.LEAD_DEMO_OUT ? new URL(process.env.LEAD_DEMO_OUT.replace(/\/?$/, '/'), 'file://') : new URL('out/', DEMO);
const wf = JSON.parse(readFileSync(new URL('n8n/consent-first-lead-capture.json', DEMO)));
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
export const SETTINGS = Object.fromEntries(byName.Settings.parameters.assignments.assignments.map((a) => [a.name, a.value]));
const TAB_NAMES = ['Contacts', 'Consent log', 'Suppression', 'Follow-up drafts'];

const compiled = {};
const runNode = (name, input, ran) => {
  compiled[name] ??= new Function('$input', '$', byName[name].parameters.jsCode);
  const items = Array.isArray(input) ? input : [input];
  const $input = { first: () => ({ json: items[0] }), all: () => items.map((json) => ({ json })) };
  const $ = (n) => ({ first: () => ({ json: [].concat(ran[n])[0] }), all: () => [].concat(ran[n]).map((json) => ({ json })) });
  return compiled[name]($input, $).map((i) => i.json);
};

// ---- the fake sheet: the same shapes Google's batchGet and batchUpdate use ----
export const loadSheet = () => existsSync(new URL('sheet.json', OUT)) ? JSON.parse(readFileSync(new URL('sheet.json', OUT))) : Object.fromEntries(TAB_NAMES.map((t) => [t, []]));
const saveSheet = (sheet) => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL('sheet.json', OUT), JSON.stringify(sheet, null, 1));
  const q = (v) => (/[",\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
  for (const [tab, rows] of Object.entries(sheet)) {
    const used = rows.filter((r) => r.some((v) => v !== ''));
    writeFileSync(new URL(tab.replace(/ /g, '-').toLowerCase() + '.csv', OUT), used.map((r) => r.map(q).join(',')).join('\n') + '\n');
  }
};
export const resetSheet = () => saveSheet(Object.fromEntries(TAB_NAMES.map((t) => [t, []])));
// Google leaves out trailing empty rows, and the values key altogether for an empty tab.
const trimmed = (rows) => { const r = [...rows]; while (r.length && r.at(-1).every((v) => v === '')) r.pop(); return r; };
const batchGet = (sheet) => ({
  valueRanges: TAB_NAMES.map((t) => { const v = trimmed(sheet[t]); return { range: (t.includes(' ') ? `'${t}'` : t) + '!A1:Z1000', majorDimension: 'ROWS', ...(v.length ? { values: v } : {}) }; }),
});
const batchUpdate = (sheet, body) => {
  if (body.valueInputOption !== 'RAW') throw new Error('expected RAW');
  for (const d of body.data) {
    const tab = d.range.match(/^'?(.*?)'?!A1$/)[1];
    if (!TAB_NAMES.includes(tab)) throw new Error(`Unable to parse range: ${d.range}`);
    const rows = sheet[tab];
    d.values.forEach((r, i) => { rows[i] = r.map(String); });
  }
};

// ---- Claude (the request body is exactly what the n8n HTTP node sends) ----
export let aiCalls = { live: 0, cached: 0, offline: 0, input_tokens: 0, output_tokens: 0 };
const askClaude = async (request, useAi) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!useAi || !key) {
    aiCalls.offline++;
    const f = JSON.parse(request.messages[0].content.split('Facts:\n')[1]);
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ subject: `Following up, ${f.organisation}`, body: `[Offline stand-in, no AI call] This is where Claude's note to ${f.first_name} would go, picking up on: ${f.their_enquiry}. Run with --ai to draft it for real.` }) }] };
  }
  const id = createHash('sha256').update(JSON.stringify(request)).digest('hex').slice(0, 16);
  const file = new URL(`cache/${id}.json`, OUT);
  if (existsSync(file)) { aiCalls.cached++; return JSON.parse(readFileSync(file)); }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const reply = await res.json();
  if (!res.ok) return { error: { status: res.status, message: reply?.error?.message || 'request failed' } };   // as n8n's "continue" output does
  aiCalls.live++;
  aiCalls.input_tokens += reply.usage?.input_tokens || 0;
  aiCalls.output_tokens += reply.usage?.output_tokens || 0;
  mkdirSync(new URL('cache/', OUT), { recursive: true });
  writeFileSync(file, JSON.stringify(reply));
  return reply;
};

// One request through the workflow: Settings > Read the sheet > Apply the change > (drafts) > Ready to save > Save > Answer.
export const handle = async ({ path, body = {}, query = {}, base, useAi = false, overrides = {}, claude }) => {
  const settings = { ...SETTINGS, sheet_id: 'local', public_base_url: base, ...overrides };
  const ran = { Settings: { ...settings, body, query, headers: {}, webhookUrl: `${base}/${path}` } };
  const sheet = loadSheet();
  ran['Read the sheet'] = batchGet(sheet);
  ran['Apply the change'] = runNode('Apply the change', ran['Read the sheet'], ran);
  let ready = ran['Apply the change'];
  if (ready[0].ai.length > 0) {
    ran['One item per draft'] = runNode('One item per draft', ready, ran);
    const replies = [];
    for (const item of ran['One item per draft']) replies.push(claude ? await claude(item.request) : await askClaude(item.request, useAi));
    ran['Ask Claude (Haiku)'] = replies;
    ready = ran['Add the drafts'] = runNode('Add the drafts', replies, ran);
  }
  ran['Ready to save'] = runNode('Ready to save', ready, ran);
  const out = ran['Ready to save'][0];
  if (out.save) { batchUpdate(sheet, out.write); saveSheet(sheet); }
  return { type: out.response_type, body: out.response_body };
};
