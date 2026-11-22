// Runs the Code nodes from the built workflow file against sample form and voice-agent payloads,
// with n8n's $input, $() and static data faked. No network, no n8n needed.
// Run: node demos/ai-voice-receptionist/scripts/test-workflow.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const wf = JSON.parse(readFileSync(new URL('../n8n/voice-receptionist.json', import.meta.url)));
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
const settings = Object.fromEntries(byName.Settings.parameters.assignments.assignments.map((a) => [a.name, a.value]));
Object.assign(settings, { elevenlabs_agent_id: 'agent_test', elevenlabs_phone_number_id: 'phnum_test', tool_secret: 'long-secret', frontdesk_whatsapp: '+447700900456' });

let store = {};
const run = (nodeName, input, ran = {}) => {
  const fn = new Function('$input', '$', '$getWorkflowStaticData', byName[nodeName].parameters.jsCode);
  return fn({ first: () => ({ json: input }) }, (name) => ({ first: () => ({ json: ran[name] }) }), () => store);
};
const hook = (body, headers = {}) => ({ ...settings, body, headers });
const decode = (form) => Object.fromEntries(new URLSearchParams(form));
let passed = 0;
const test = (name, fn) => { store = {}; fn(); passed++; console.log('ok', name); };
const FORM = { source: 'web-form', first_name: 'Sam', phone: '07700 900123', reason: 'consultation', consent: 'yes' };

test('call-back form: builds the ElevenLabs request with a personal first line', () => {
  const [out] = run('Check the call-back request', hook(FORM));
  assert.equal(out.json.place_call, true);
  const r = out.json.request;
  assert.equal(r.agent_id, 'agent_test');
  assert.equal(r.agent_phone_number_id, 'phnum_test');
  assert.equal(r.to_number, '+447700900123');
  assert.equal(r.conversation_initiation_client_data.conversation_config_override.agent.first_message,
    "Hi Sam, it's the AI assistant at Lumen Skin Clinic, calling back about booking a consultation. This call is recorded. Is now still a good time?");
  assert.ok(!JSON.stringify(store).includes('900123'), 'the number itself is never stored');
});

test('no consent tick: no call', () => {
  const [out] = run('Check the call-back request', hook({ ...FORM, consent: '' }));
  assert.equal(out.json.place_call, false);
});

test('same number again within 10 minutes: no second call', () => {
  run('Check the call-back request', hook(FORM));
  const [out] = run('Check the call-back request', hook(FORM));
  assert.equal(out.json.place_call, false);
  assert.match(out.json.note, /recently/);
});

test('daily cap: no call, front desk told to ring', () => {
  store = { day: { date: new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/London' }), count: 20 } };
  const fn = new Function('$input', '$', '$getWorkflowStaticData', byName['Check the call-back request'].parameters.jsCode);
  const [out] = fn({ first: () => ({ json: hook(FORM) }) }, null, () => store);
  assert.equal(out.json.place_call, false);
  assert.match(decode(out.json.messages[0].form).Body, /daily limit of 20 calls/);
});

test('call failed: front desk asked to ring', () => {
  const [req] = run('Check the call-back request', hook(FORM));
  const [out] = run('Call failed: tell the front desk', {}, { Settings: settings, 'Check the call-back request': req.json });
  assert.equal(decode(out.json.messages[0].form).Body, 'The assistant could not ring +447700900123 back. Please call them.');
});

test('agent tool, inbound call: caller number from caller_id, one tidy line to the front desk', () => {
  const [out] = run('Word the booking request', hook(
    { first_name: 'Sam', patient_type: 'existing', about: 'a follow-up, email sam@example.com', preferred_time: 'Thursday after four', caller_id: '+447700900123', called_number: '+441134960456' },
    { 'x-demo-secret': 'long-secret' }));
  const reply = JSON.parse(out.json.response_body);
  assert.equal(reply.result, 'sent');
  assert.equal(reply.say, 'The team has the request and will call back Thursday after four.');
  assert.equal(decode(out.json.messages[0].form).Body,
    'Call back request (phone assistant): Sam, existing client, about a follow-up, email. Call Thursday after four on +447700900123.');
});

test('agent tool, outbound call: the number is the called one, not the clinic', () => {
  const [out] = run('Word the booking request', hook(
    { first_name: 'Sam', patient_type: 'new', about: 'consultation', preferred_time: 'tomorrow morning', caller_id: '+441134960456', called_number: '+447700900123' },
    { 'x-demo-secret': 'long-secret' }));
  assert.match(decode(out.json.messages[0].form).Body, /new client, about consultation\. Call tomorrow morning on \+447700900123\.$/);
});

test('agent tool without the secret is refused and sends nothing', () => {
  const [out] = run('Word the booking request', hook({ first_name: 'Sam' }, { 'x-demo-secret': 'wrong' }));
  assert.equal(JSON.parse(out.json.response_body).result, 'refused');
  assert.equal(out.json.messages.length, 0);
});

test('agent tool while tool_secret is still CHANGE ME is refused', () => {
  const [out] = run('Word the booking request', { ...hook({ first_name: 'Sam' }, { 'x-demo-secret': 'CHANGE ME' }), tool_secret: 'CHANGE ME' });
  assert.equal(JSON.parse(out.json.response_body).result, 'refused');
});

console.log(`\n${passed} checks passed`);
