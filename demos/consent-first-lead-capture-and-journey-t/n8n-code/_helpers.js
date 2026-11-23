// Shared helpers, added to the top of every Code node by scripts/build-workflow.py.
// n8n Code nodes cannot import from each other, so each node gets its own copy.

// ---- The four tabs of the Google Sheet, and their columns (row 1 of each tab) ----
const TABS = {
  contacts: { name: 'Contacts', cols: ['match_key', 'email', 'first_name', 'last_name', 'organisation', 'job_title', 'sources', 'stage', 'stage_reason', 'stage_changed', 'newsletter', 'consent_wording', 'consent_source', 'consent_date', 'lawful_basis', 'confirmed_date', 'clicks', 'enquiries', 'last_enquiry', 'first_seen', 'last_updated', 'confirm_token', 'unsubscribe_token'] },
  consent: { name: 'Consent log', cols: ['logged_at', 'match_key', 'event', 'source', 'form_version', 'wording', 'lawful_basis', 'evidence'] },
  suppression: { name: 'Suppression', cols: ['added_at', 'match_key', 'email', 'reason', 'how'] },
  drafts: { name: 'Follow-up drafts', cols: ['drafted_at', 'match_key', 'first_name', 'organisation', 'why_now', 'subject', 'draft', 'status', 'model'] },
};
const STAGES = ['Discovered', 'Engaged', 'Identified', 'Opportunity'];

// ---- Email addresses ----
// The address to keep: trimmed, lower case, with "mailto:", "Name <...>" and stray dots removed. Null if it isn't an address.
const cleanEmail = (raw) => {
  let e = String(raw ?? '').trim();
  const angled = e.match(/<([^>]+)>/);
  if (angled) e = angled[1];
  e = e.replace(/^mailto:/i, '').replace(/\s+/g, '').replace(/\.+$/, '').toLowerCase();
  return /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(e) ? e : null;
};
// The key used to spot the same person twice: the clean address without a "+tag" (sam+news@ is sam@).
const matchKey = (email) => email.replace(/\+[^@]*@/, '@');

// ---- Text ----
const tidy = (v, max = 120) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const nameCase = (v) => tidy(v, 60).toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
// Emails and phone numbers are masked before free text goes to the AI or into a draft.
const mask = (t) => String(t ?? '')
  .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email removed]')
  .replace(/\+?\d[\d\s().-]{8,}\d/g, '[number removed]');
// A cell can never start a formula, even if someone types "=HYPERLINK(...)" into a form (we also write RAW).
const cell = (v) => { const s = String(v ?? ''); return /^[=+\-@]/.test(s) ? "'" + s : s; };
const esc = (t) => String(t ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- Dates (UK time, written so a sheet sorts them) ----
const nowStamp = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
};

// A random token for confirm and unsubscribe links (Web Crypto when n8n offers it).
const token = () => {
  const bytes = new Uint8Array(12);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

// ---- CSV (a LinkedIn lead export, or a newsletter click report) ----
const parseCsv = (text) => {
  const rows = []; let row = []; let field = ''; let quoted = false;
  const s = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
};
// The first column whose header is one of these names (exports differ, so several spellings are accepted).
const pick = (row, ...names) => { for (const n of names) if (row[n] !== undefined && row[n] !== '') return row[n]; return ''; };

// ---- The sheet: Google's batchGet reply in, plain tables out, and back ----
const readTabs = (reply) => {
  const out = {};
  const ranges = reply?.valueRanges || [];
  for (const [key, tab] of Object.entries(TABS)) {
    const vr = ranges.find((r) => String(r.range || '').replace(/'/g, '').startsWith(tab.name + '!'));
    const values = vr?.values || [];
    const head = values.length ? values[0].map((h) => String(h).trim()) : tab.cols;
    const rows = values.slice(1)
      .filter((r) => r.some((v) => String(v).trim() !== ''))
      .map((r) => Object.fromEntries(tab.cols.map((c) => { const i = head.indexOf(c); return [c, i < 0 ? '' : String(r[i] ?? '').replace(/^'(?=[=+\-@])/, '')]; })));
    out[key] = { rows, height: values.length };
  }
  return out;
};
// One batchUpdate body that writes every changed tab in full: header, rows, then blank rows over anything left below.
const writeBody = (tabs, changed) => ({
  valueInputOption: 'RAW',
  data: changed.map((key) => {
    const { name, cols } = TABS[key];
    const values = [cols, ...tabs[key].rows.map((r) => cols.map((c) => cell(r[c])))];
    while (values.length < tabs[key].height) values.push(cols.map(() => ''));
    return { range: `'${name}'!A1`, values };
  }),
});

// ---- Journey stage: plain rules, in order, the first that matches wins ----
const num = (v) => Number.parseInt(v, 10) || 0;
const stageOf = (c, s) => {
  const clicks = num(c.clicks), enquiries = num(c.enquiries);
  const known = c.first_name && c.organisation;
  const confirmed = c.newsletter === 'confirmed';
  const many = num(s.clicks_for_opportunity), some = num(s.clicks_for_identified);
  if (enquiries > 0) return ['Opportunity', 'Sent an enquiry'];
  if (known && confirmed && clicks >= many) return ['Opportunity', `Confirmed subscriber, ${clicks} clicks`];
  if (known && (clicks >= some || (confirmed && c.job_title))) return ['Identified', clicks >= some ? `Name and organisation known, ${clicks} clicks` : 'Confirmed subscriber with name, organisation and role'];
  if (confirmed) return ['Engaged', 'Confirmed the newsletter'];
  if (clicks > 0) return ['Engaged', `${clicks} click${clicks === 1 ? '' : 's'}`];
  return ['Discovered', c.newsletter === 'pending' ? 'Sign-up not confirmed yet' : 'In the list, no activity yet'];
};
// Set the stage and stamp it only when it moves.
const restage = (c, s, at) => {
  const [stage, why] = stageOf(c, s);
  if (stage !== c.stage) c.stage_changed = at;
  c.stage = stage; c.stage_reason = why;
  return c;
};

// A short, stable ID for a contact that doesn't show their address.
const hash = (text) => {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
};
// What the team view shows: no email addresses, just enough to see the journey.
const summary = (tabs) => {
  const blocked = new Set(tabs.suppression.rows.map((r) => r.match_key));
  return {
    stages: STAGES,
    contacts: tabs.contacts.rows.map((c) => ({
      id: hash(c.match_key),
      name: [c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)',
      organisation: c.organisation, sources: c.sources, stage: c.stage, why: c.stage_reason,
      newsletter: c.newsletter, changed: c.stage_changed, suppressed: blocked.has(c.match_key),
    })),
    counts: Object.fromEntries(STAGES.map((st) => [st, tabs.contacts.rows.filter((c) => c.stage === st).length])),
    suppressed: tabs.suppression.rows.length,
    drafts: tabs.drafts.rows.filter((d) => d.status === 'To review').length,
  };
};

// A small HTML page for the confirm and unsubscribe links (n8n answers the browser directly).
const page = (s, title, body) => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} | ${esc(s.business_name)} (demo)</title>
<style>:root{--bg:#eef0ec;--ink:#2b2238;--ink-2:#4a4256;--card:#fff;--line:#d6d3cf;--gold:#e8a317;--sea:#2f7a72;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#1c1626;--ink:#eeeaf2;--ink-2:#cfc8d8;--card:#262033;--line:#3b3348;--sea:#7fd0c5;color-scheme:dark}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink-2);font:400 17px/1.65 Georgia,"Times New Roman",serif;padding:16px;box-sizing:border-box}
main{max-width:460px;width:100%;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:32px}
h1{font:700 1.6rem/1.2 system-ui,sans-serif;color:var(--ink);margin:0 0 .5em;letter-spacing:-.02em}
button{font:600 1rem system-ui,sans-serif;background:var(--gold);color:#2b2238;border:0;border-radius:999px;padding:14px 24px;cursor:pointer;min-height:44px}
button:focus-visible{outline:3px solid var(--sea);outline-offset:3px}small{display:block;margin-top:20px;font:13px/1.5 system-ui,sans-serif;color:var(--ink-2)}</style></head>
<body><main>${body}<small>${esc(s.business_name)} is a fictional business. This page is part of a demo: no email was sent.</small></main></body></html>`;
