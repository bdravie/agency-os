// Runs the Code nodes from the built workflow file against sample Twilio and form payloads,
// with n8n's $input, $() and static data faked. No network, no n8n needed.
// Run: node demos/missed-call-whatsapp-text-back/scripts/test-workflow.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const wf = JSON.parse(readFileSync(new URL('../n8n/missed-call-text-back.json', import.meta.url)));
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
const settings = Object.fromEntries(byName.Settings.parameters.assignments.assignments.map((a) => [a.name, a.value]));
settings.twilio_account_sid = 'AC_TEST';

let store = {};
const run = (nodeName, input, ran = {}) => {
  const fn = new Function('$input', '$', '$getWorkflowStaticData', byName[nodeName].parameters.jsCode);
  const $input = { first: () => ({ json: input }), all: () => [{ json: input }] };
  const $ = (name) => ({ first: () => ({ json: ran[name] }) });
  return fn($input, $, () => store);
};
const hook = (body, extra = {}) => ({ ...settings, ...extra, body, headers: { host: 'demo.trycloudflare.com', 'x-forwarded-proto': 'https' }, webhookUrl: 'https://demo.trycloudflare.com/webhook/missed-call/voice' });
const decode = (form) => Object.fromEntries(new URLSearchParams(form));
let passed = 0;
const test = (name, fn) => { store = {}; fn(); passed++; console.log('ok', name); };

const CALLER = '+447700900123';

test('missed call (no forward_to): caller hears the message and gets one WhatsApp', () => {
  const [out] = run('Decide: ring, missed or form', hook({ CallSid: 'CA1', From: CALLER }));
  assert.match(out.json.response_body, /^<Response><Say voice="Polly.Amy" language="en-GB">Sorry, we can&apos;t get to the phone/);
  assert.equal(out.json.messages.length, 1);
  const m = decode(out.json.messages[0].form);
  assert.equal(m.To, 'whatsapp:' + CALLER);
  assert.equal(m.From, 'whatsapp:+14155238886');
  assert.match(m.Body, /^Hi, it's Brightmoor Dental\. Sorry we missed your call/);
  assert.ok(!m.Body.includes('book online'), 'no booking link set, so that line is dropped');
  assert.match(m.Body, /Reply STOP and we won't message again\.$/);
  assert.ok(!JSON.stringify(store).includes('7700900123'), 'the number itself is never stored');
});

test('a second missed call within 30 minutes is not texted again', () => {
  run('Decide: ring, missed or form', hook({ CallSid: 'CA1', From: CALLER }));
  const [out] = run('Decide: ring, missed or form', hook({ CallSid: 'CA2', From: CALLER }));
  assert.equal(out.json.messages.length, 0);
  assert.match(out.json.note, /messaged recently/);
});

test('withheld number: polite message, no WhatsApp', () => {
  const [out] = run('Decide: ring, missed or form', hook({ CallSid: 'CA1', From: '+266696687' }));
  assert.equal(out.json.messages.length, 0);
  assert.match(out.json.response_body, /Please try again shortly/);
});

test('with forward_to: rings the front desk with an absolute action URL', () => {
  const [out] = run('Decide: ring, missed or form', hook({ CallSid: 'CA1', From: CALLER }, { forward_to: '+447700900456' }));
  assert.equal(out.json.response_body,
    '<Response><Dial timeout="12" action="https://demo.trycloudflare.com/webhook/missed-call/dial-status" method="POST"><Number>+447700900456</Number></Dial></Response>');
  assert.equal(out.json.messages.length, 0);
});

test('front desk answered: hang up, nothing sent', () => {
  const [out] = run('Decide: ring, missed or form', hook({ CallSid: 'CA1', From: CALLER, DialCallStatus: 'completed' }, { forward_to: '+447700900456' }));
  assert.equal(out.json.response_body, '<Response><Hangup/></Response>');
  assert.equal(out.json.messages.length, 0);
});

test('front desk did not answer: text back plus a heads-up to the front desk', () => {
  const [out] = run('Decide: ring, missed or form',
    hook({ CallSid: 'CA1', From: CALLER, DialCallStatus: 'no-answer' }, { forward_to: '+447700900456', frontdesk_whatsapp: '+447700900456' }));
  assert.equal(out.json.messages.length, 2);
  assert.match(decode(out.json.messages[1].form).Body, /^Missed call at \d\d:\d\d from \+447700900123\. WhatsApp text-back sent\.$/);
});

test('approved template (outside the 24-hour window): ContentSid instead of Body', () => {
  const [out] = run('Decide: ring, missed or form', hook({ CallSid: 'CA1', From: CALLER }, { content_sid_missed: 'HX123' }));
  const m = decode(out.json.messages[0].form);
  assert.equal(m.ContentSid, 'HX123');
  assert.equal(m.ContentVariables, '{"1":"Brightmoor Dental"}');
  assert.equal(m.Body, undefined);
});

test('website form: 07 number normalised, first name and reason used, free text ignored', () => {
  const [out] = run('Decide: ring, missed or form',
    hook({ source: 'web-form', first_name: 'Sam <b>', phone: '07700 900123', reason: 'checkup', consent: 'yes' }));
  assert.equal(out.json.response_type, 'application/json');
  const m = decode(out.json.messages[0].form);
  assert.equal(m.To, 'whatsapp:+447700900123');
  assert.match(m.Body, /^Hi Sam, it's Brightmoor Dental\. Thanks for leaving your number about booking a check-up\./);
});

test('website form without the consent tick sends nothing', () => {
  const [out] = run('Decide: ring, missed or form', hook({ source: 'web-form', phone: '07700 900123', reason: 'checkup' }));
  assert.equal(out.json.messages.length, 0);
  assert.equal(JSON.parse(out.json.response_body).error, 'consent');
});

test('STOP on WhatsApp blocks later text-backs', () => {
  const [stop] = run('Prepare the conversation', hook({ From: 'whatsapp:' + CALLER, Body: 'STOP' }));
  assert.equal(stop.json.ask_ai, false);
  assert.match(stop.json.response_body, /won&apos;t hear from us again/);
  const [call] = run('Decide: ring, missed or form', hook({ CallSid: 'CA1', From: CALLER }));
  assert.equal(call.json.messages.length, 0);
  assert.match(call.json.note, /opted out/);
});

test('WhatsApp reply: request built for Haiku, context from the missed call, contact details masked', () => {
  run('Decide: ring, missed or form', hook({ CallSid: 'CA1', From: CALLER }));
  const [prep] = run('Prepare the conversation', hook({ From: 'whatsapp:' + CALLER, Body: 'New patient, call me Thursday after 5 on 07700 900999 or sam@example.com' }));
  const r = prep.json.request;
  assert.equal(r.model, 'claude-haiku-5-5');
  assert.equal(r.output_config.effort, 'low');
  assert.match(r.system, /How this person reached us: rang the practice and the call was missed/);
  assert.ok(!/\{\w+\}/.test(r.system), 'no placeholder left in the prompt');
  assert.equal(r.messages.at(-1).content, 'New patient, call me Thursday after 5 on [number removed] or [email removed]');
});

test("Claude's reply: TwiML message out, one handover summary to the front desk", () => {
  const s = { ...settings, frontdesk_whatsapp: '+447700900456' };
  const [prep] = run('Prepare the conversation', hook({ From: 'whatsapp:' + CALLER, Body: 'Check-up, new patient, Thursday 5pm' }));
  const say = (fields) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ patient: '', about: '', call_back: '', ...fields }) }] });
  const ctx = { Settings: s, 'Prepare the conversation': prep.json };
  const [first] = run("Read Claude's reply", say({ reply: 'Are you new or existing?', about: 'check-up', call_back: 'Thursday 5pm' }), ctx);
  assert.equal(first.json.messages.length, 0, 'not handed over while a field is missing');
  const [out] = run("Read Claude's reply", say({ reply: "Lovely, we'll call Thursday at 5 to book you in.", patient: 'new' }), ctx);
  assert.equal(out.json.response_body, '<Response><Message>Lovely, we&apos;ll call Thursday at 5 to book you in.</Message></Response>');
  assert.equal(out.json.messages.length, 1);
  assert.equal(decode(out.json.messages[0].form).Body, 'Call back request from +447700900123: new patient, about check-up. Call Thursday 5pm.');
  const [again] = run("Read Claude's reply", say({ reply: 'Thanks!', patient: 'new', about: 'check-up', call_back: 'Thursday 5pm' }), ctx);
  assert.equal(again.json.messages.length, 0, 'the front desk is told once per conversation');
});

test('Claude unavailable or unreadable: fallback reply', () => {
  const [prep] = run('Prepare the conversation', hook({ From: 'whatsapp:' + CALLER, Body: 'hello' }));
  const [bad] = run("Read Claude's reply", { content: [{ type: 'text', text: 'not json' }] }, { Settings: settings, 'Prepare the conversation': prep.json });
  assert.match(bad.json.response_body, /Someone from the front desk will reply shortly/);
  const [fb] = run('Fallback reply', {}, { Settings: settings, 'Prepare the conversation': prep.json });
  assert.match(fb.json.response_body, /Someone from the front desk will reply shortly/);
});

test('photo with no text is not sent to the AI', () => {
  const [out] = run('Prepare the conversation', hook({ From: 'whatsapp:' + CALLER, Body: '', NumMedia: '1' }));
  assert.equal(out.json.ask_ai, false);
});

test('one item per message', () => {
  const items = run('One item per message (calls)', { messages: [{ form: 'a' }, { form: 'b' }] });
  assert.deepEqual(items.map((i) => i.json.form), ['a', 'b']);
  assert.deepEqual(run('One item per message (calls)', { messages: [] }), []);
});

console.log(`\n${passed} checks passed`);
