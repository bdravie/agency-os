// Checks the Code nodes from the built workflow file against the sample data, with n8n and Google Sheets faked
// (scripts/engine.mjs) and Claude stubbed. No network, no n8n, no Google account needed.
// Run: node demos/consent-first-lead-capture-and-journey-t/scripts/test-workflow.mjs
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

process.env.LEAD_DEMO_OUT = mkdtempSync(join(tmpdir(), 'lead-demo-'));
const { handle, resetSheet, loadSheet, SETTINGS } = await import('./engine.mjs');
const { seed, loom } = await import('./story.mjs');

const BASE = 'http://127.0.0.1:5690/webhook/lead-capture';
const KEY = SETTINGS.team_key;
let claude = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ subject: 'Your sponsorship question', body: 'Thanks for getting in touch through our website about finding a sponsor. A good first step is a short list of local businesses whose aims match yours. Would a twenty minute call next week help us work that out together?' }) }] });
const call = async (path, fields) => {
  const [p, qs] = path.split('?');
  return handle({ path: p, base: BASE, query: Object.fromEntries(new URLSearchParams(qs || '')), body: fields || {}, claude: (r) => claude(r) });
};
const post = async (path, fields) => JSON.parse((await call(path, fields)).body);
const rows = (tab) => { const [head, ...rest] = loadSheet()[tab].filter((r) => r.some((v) => v !== '')); return head ? rest.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))) : []; };
const contact = (email) => rows('Contacts').find((c) => c.match_key === email);
const tokenOf = (link) => new URL(link).searchParams.get('t');

let passed = 0;
const test = async (name, fn) => { resetSheet(); await fn(); passed++; console.log('ok', name); };

await test('the sample data gives one list of 25 contacts: three duplicates merged, every source kept', async () => {
  await seed(call, KEY);
  await loom(call, KEY);
  const c = rows('Contacts');
  assert.equal(c.length, 25);
  assert.equal(new Set(c.map((x) => x.match_key)).size, 25);
  assert.equal(contact('dev.okafor@example.net').sources, 'Website newsletter, Website enquiry');
  assert.equal(contact('priya.raman@example.org').sources, 'Website enquiry, LinkedIn lead form');
  assert.equal(contact('priya.raman@example.org').job_title, 'Programme Director', 'LinkedIn fills a gap');
  assert.equal(contact('imogen.thackeray@example.com').sources, 'Website newsletter, LinkedIn lead form');
  assert.ok(c.every((x) => x.email.endsWith('example.com') || x.email.endsWith('example.org') || x.email.endsWith('example.net')));
});

await test('a sign-up is pending, with the form\'s own wording, date and lawful basis; the page cannot change the wording', async () => {
  const r = await post('signup', { form: 'newsletter', email: 'Sam.Lee@Example.com ', first_name: 'sam', organisation: 'Test Trust', consent: 'yes', consent_text: 'I agree to anything' });
  assert.equal(r.ok, true);
  assert.match(r.demo_confirm_link, /\/confirm\?t=[0-9a-f]{24}$/);
  const c = contact('sam.lee@example.com');
  assert.equal(c.newsletter, 'pending');
  assert.equal(c.first_name, 'Sam');
  assert.equal(c.consent_wording, SETTINGS.newsletter_wording);
  assert.match(c.consent_date, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
  assert.equal(c.lawful_basis, 'Consent (newsletter, waiting for confirmation)');
  assert.equal(c.stage, 'Discovered');
  const log = rows('Consent log');
  assert.equal(log.length, 1);
  assert.equal(log[0].form_version, SETTINGS.newsletter_form_version);
  assert.ok(!JSON.stringify(loadSheet()).includes('I agree to anything'));
});

await test('the forms refuse a bad address, a missing tick and an empty enquiry; a bot is ignored quietly', async () => {
  assert.equal((await post('signup', { form: 'newsletter', email: 'not-an-email', consent: 'yes' })).field, 'email');
  assert.equal((await post('signup', { form: 'newsletter', email: 'a@example.com' })).field, 'consent');
  assert.equal((await post('signup', { form: 'enquiry', email: 'a@example.com', message: 'hi' })).field, 'message');
  assert.equal((await post('signup', { form: 'newsletter', email: 'bot@example.com', consent: 'yes', website: 'spam.example' })).ok, true);
  assert.equal(rows('Contacts').length, 0);
});

await test('confirming: opening the link changes nothing, the button confirms, the link then stops working', async () => {
  const { demo_confirm_link: link } = await post('signup', { form: 'newsletter', email: 'kim@example.org', first_name: 'Kim', consent: 'yes' });
  const page = await call(`confirm?t=${tokenOf(link)}`);
  assert.match(page.body, /Yes, subscribe me/);
  assert.equal(contact('kim@example.org').newsletter, 'pending', 'a mail scanner opening the link must not confirm');
  const done = await call('confirmed', { t: tokenOf(link) });
  assert.match(done.body, /You're subscribed/);
  assert.match(done.body, /unsubscribe\?t=[0-9a-f]{24}/);
  const c = contact('kim@example.org');
  assert.equal(c.newsletter, 'confirmed');
  assert.equal(c.stage, 'Engaged');
  assert.equal(c.lawful_basis, 'Consent (newsletter, confirmed)');
  assert.ok(rows('Consent log').some((l) => l.event === 'Newsletter confirmed'));
  assert.match((await call('confirmed', { t: tokenOf(link) })).body, /already been used/);
  assert.match((await call('confirm?t=nonsense')).body, /already been used/);
});

await test('a second newsletter tick from LinkedIn keeps the first confirm link working', async () => {
  const { demo_confirm_link: link } = await post('signup', { form: 'newsletter', email: 'jo@example.com', first_name: 'Jo', organisation: 'A Trust', consent: 'yes' });
  await post('team', { key: KEY, action: 'linkedin', csv: 'First name,Email address,Job title,Newsletter consent\nJo, JO@example.com ,Director,Yes\n' });
  assert.match((await call('confirmed', { t: tokenOf(link) })).body, /You're subscribed/);
  assert.equal(contact('jo@example.com').stage, 'Identified');
  assert.equal(rows('Consent log').length, 3);
});

await test('stages follow the rules: clicks, confirmation, organisation and an enquiry move people along', async () => {
  await post('team', { key: KEY, action: 'linkedin', csv: 'First name,Email address,Company name,Job title\nAl,al@example.com,Org,Lead\nBea,bea@example.com,,\n' });
  assert.equal(contact('al@example.com').stage, 'Discovered');
  await post('team', { key: KEY, action: 'clicks', csv: 'email,clicks\nal@example.com,1\nbea@example.com,4\n' });
  assert.equal(contact('al@example.com').stage, 'Engaged');
  assert.equal(contact('bea@example.com').stage, 'Engaged', 'no name and organisation, so not Identified');
  await post('team', { key: KEY, action: 'clicks', csv: 'email,clicks\nal@example.com,2\nal@example.com,0\n' });
  assert.equal(contact('al@example.com').clicks, '2', 'a report never lowers a count');
  assert.equal(contact('al@example.com').stage, 'Identified');
  await post('signup', { form: 'enquiry', email: 'al@example.com', message: 'Could we talk about a sponsor for our spring event?' });
  const al = contact('al@example.com');
  assert.equal(al.stage, 'Opportunity');
  assert.equal(al.stage_reason, 'Sent an enquiry');
  assert.equal(al.lawful_basis, 'Legitimate interests (replying to their enquiry); Legitimate interests (following up their LinkedIn form)');
});

await test('unsubscribing: link shows a button, button suppresses, the person is never added back', async () => {
  const { demo_confirm_link: link } = await post('signup', { form: 'enquiry', email: 'ray@example.net', first_name: 'Ray', organisation: 'Org', message: 'Please tell me about your workshops.', newsletter: 'yes' });
  const done = await call('confirmed', { t: tokenOf(link) });
  const unsub = done.body.match(/unsubscribe\?t=([0-9a-f]+)/)[1];
  assert.match((await call(`unsubscribe?t=${unsub}`)).body, /Unsubscribe me/);
  assert.equal(rows('Suppression').length, 0);
  assert.match((await call('unsubscribed', { t: unsub })).body, /You're unsubscribed/);
  assert.equal(rows('Suppression').length, 1);
  assert.equal(contact('ray@example.net').newsletter, 'unsubscribed');
  assert.match(contact('ray@example.net').lawful_basis, /^Unsubscribed: do not contact/);
  const again = await post('signup', { form: 'newsletter', email: 'RAY@example.net', consent: 'yes' });
  assert.equal(again.ok, true);
  assert.equal(again.demo_confirm_link, undefined, 'the same answer as anyone else, but no new link');
  const li = await post('team', { key: KEY, action: 'linkedin', csv: 'Email address,Newsletter consent\nray+x@example.net,Yes\n' });
  assert.equal(li.report[0].result, 'skipped');
  assert.equal(contact('ray@example.net').newsletter, 'unsubscribed');
});

await test('a team unsubscribe for someone not in the list still suppresses them, so a later import skips them', async () => {
  await post('team', { key: KEY, action: 'unsubscribe', email: 'stranger@example.com', reason: 'Asked by phone' });
  const li = await post('team', { key: KEY, action: 'linkedin', csv: 'Email address\nStranger@example.com\n' });
  assert.equal(li.report[0].why, 'on the suppression list, so not added back');
  assert.equal(rows('Contacts').length, 0);
});

await test('drafts: Opportunity contacts only, suppressed and newsletter-only ones skipped, greeting and opt-out added in code', async () => {
  await seed(call, KEY);
  const d = await loom(call, KEY);
  assert.equal(d.drafted, 5);
  assert.deepEqual(d.skipped.map((x) => x.why).sort(), ['newsletter consent only, so invite them through the newsletter instead', 'on the suppression list']);
  const drafts = rows('Follow-up drafts');
  assert.ok(!drafts.some((x) => x.match_key === 'sofia.marin@example.net'));
  const dev = drafts.find((x) => x.match_key === 'dev.okafor@example.net');
  assert.equal(dev.status, 'To review');
  assert.match(dev.draft, /^Hi Dev,\n\n/);
  assert.ok(dev.draft.endsWith(`${SETTINGS.sender_name}\n${SETTINGS.business_name}\n\n${SETTINGS.opt_out_line}`));
  const again = await post('team', { key: KEY, action: 'drafts' });
  assert.equal(again.drafted, 0, 'nobody is drafted for twice');
});

await test('what reaches Claude: Haiku, low effort, structured reply, enquiry with contact details masked', async () => {
  let seen;
  claude = (r) => { seen = r; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ subject: 'Hello', body: 'word '.repeat(30) }) }] }; };
  await post('signup', { form: 'enquiry', email: 'pat@example.com', first_name: 'Pat', message: 'Call me on 07700 900123 or pat.home@example.org about sponsors' });
  await post('team', { key: KEY, action: 'drafts' });
  assert.equal(seen.model, 'claude-haiku-5-5');
  assert.equal(seen.output_config.effort, 'low');
  assert.equal(seen.output_config.format.type, 'json_schema');
  assert.ok(!/\{\w+\}/.test(seen.system), 'no placeholder left in the prompt');
  assert.match(seen.messages[0].content, /Call me on \[number removed\] or \[email removed\] about sponsors/);
  assert.ok(!JSON.stringify(loadSheet()).includes('07700 900123'), 'the number is masked in the sheet too');
});

await test('a draft with a figure or a link is flagged, a failed call is marked, and the next run replaces both', async () => {
  await post('signup', { form: 'enquiry', email: 'a1@example.com', first_name: 'Ann', message: 'Interested in your workshops for trustees.' });
  await post('signup', { form: 'enquiry', email: 'b1@example.com', first_name: 'Bo', message: 'Interested in your workshops for trustees.' });
  const replies = [
    { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ subject: 'Workshops', body: 'Our workshops raise 40% more for trusts like yours, see www.example.com for the details and dates, and let me know which session would suit your trustees best this spring please.' }) }] },
    { error: { status: 529, message: 'Overloaded' } },
  ];
  claude = () => replies.shift();
  await post('team', { key: KEY, action: 'drafts' });
  const [ann, bo] = rows('Follow-up drafts');
  assert.match(ann.status, /^Check: .*has a link.*states a figure/);
  assert.equal(bo.status, 'Draft failed: run again');
  claude = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ subject: 'Your trustees', body: 'Thanks for asking about the workshops. The spring dates are being set now, and I would be glad to hold two places for your trustees. Would a quick reply with the weeks that suit you be easiest?' }) }] });
  const r = await post('team', { key: KEY, action: 'drafts' });
  assert.equal(r.drafted, 2);
  assert.equal(rows('Follow-up drafts').length, 2, 'replaced, not duplicated');
});

await test('unsubscribing withdraws a draft waiting for review', async () => {
  claude = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ subject: 'Your question', body: 'word '.repeat(30) }) }] });
  await post('signup', { form: 'enquiry', email: 'cy@example.com', first_name: 'Cy', message: 'Tell me about sponsorship packs.' });
  await post('team', { key: KEY, action: 'drafts' });
  await post('team', { key: KEY, action: 'unsubscribe', email: 'cy@example.com' });
  assert.equal(rows('Follow-up drafts')[0].status, 'Withdrawn: unsubscribed');
});

await test('a typed formula is stored as text, never run by the sheet', async () => {
  await post('signup', { form: 'newsletter', email: 'f@example.com', organisation: '=HYPERLINK("http://bad.example","x")', consent: 'yes' });
  const [head, row] = loadSheet().Contacts;
  assert.ok(row[head.indexOf('organisation')].startsWith("'="), 'starts with an apostrophe so Sheets shows it as text');
  await post('team', { key: KEY, action: 'clicks', csv: 'email,clicks\nf@example.com,1\n' });   // read, changed and written again
  assert.equal(loadSheet().Contacts[1][head.indexOf('organisation')], row[head.indexOf('organisation')], 'no second apostrophe');
});

await test('the team view needs the key and shows no email addresses', async () => {
  assert.equal((await post('team', { key: 'wrong', action: 'view' })).ok, false);
  await post('signup', { form: 'newsletter', email: 'hidden@example.com', first_name: 'Hid', consent: 'yes' });
  const v = await post('team', { key: KEY, action: 'view' });
  assert.equal(v.contacts.length, 1);
  assert.ok(!JSON.stringify(v).includes('hidden@example.com'));
  assert.deepEqual(v.stages, ['Discovered', 'Engaged', 'Identified', 'Opportunity']);
});

await test('the workflow file: every webhook answers through one Respond node, and the sheet is written RAW', async () => {
  const wf = JSON.parse(readFileSync(new URL('../n8n/consent-first-lead-capture.json', import.meta.url)));
  const hooks = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook');
  assert.deepEqual(hooks.map((h) => `${h.parameters.httpMethod} ${h.parameters.path}`).sort(),
    ['GET lead-capture/confirm', 'GET lead-capture/unsubscribe', 'POST lead-capture/confirmed', 'POST lead-capture/signup', 'POST lead-capture/team', 'POST lead-capture/unsubscribed']);
  assert.ok(hooks.every((h) => h.parameters.responseMode === 'responseNode'));
  assert.equal(wf.nodes.filter((n) => n.type === 'n8n-nodes-base.respondToWebhook').length, 1);
  const sheetNodes = wf.nodes.filter((n) => n.parameters.nodeCredentialType === 'googleSheetsOAuth2Api');
  assert.equal(sheetNodes.length, 2);
  assert.ok(!JSON.stringify(wf).includes('sk-ant'), 'no key in the file');
});

console.log(`\n${passed} checks passed`);
