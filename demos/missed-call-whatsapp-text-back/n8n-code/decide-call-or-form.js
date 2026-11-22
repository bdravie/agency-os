// Calls and the website form. Works out what Twilio should do with the call (TwiML),
// or what to tell the web page, and which WhatsApp messages to send.
//   1. A call comes in: ring the front desk (forward_to) for ring_seconds, or treat it as missed if there is no forward_to.
//   2. The ringing ends: if nobody answered (no-answer, busy, failed, canceled), it is a missed call.
//   3. A missed call or a website form: one WhatsApp to the person, plus an optional heads-up to the front desk.
// Checks before sending: not withheld, not opted out (STOP), not already messaged in the last dedupe_minutes.
const s = $input.first().json;            // Settings, plus the webhook's own fields (body, headers, webhookUrl)
const b = s.body || {};
const store = $getWorkflowStaticData('global');
store.sent ??= {}; store.optedOut ??= {}; store.context ??= {};
const now = Date.now();
for (const k of Object.keys(store.sent)) if (now - store.sent[k] > DAY) delete store.sent[k];
for (const k of Object.keys(store.context)) if (now - store.context[k].at > DAY) delete store.context[k];

const values = { practice: s.practice_name, phone: s.practice_phone, booking_link: s.booking_link || '' };
const say = (text) => `<Say voice="${xml(s.voice)}" language="en-GB">${xml(text)}</Say>`;
const reply = (response_type, response_body, messages = [], note = '') => [{ json: { response_type, response_body, messages, note } }];

const REASONS = {
  checkup: 'booking a check-up',
  hygienist: 'seeing the hygienist',
  new: 'joining as a new patient',
  change: 'changing an appointment',
  other: 'your enquiry',
};

// ---- Website form -------------------------------------------------------------------------
if (b.source === 'web-form') {
  const to = e164(b.phone);
  if (!to) return reply('application/json', JSON.stringify({ ok: false, error: 'phone' }), [], 'Form: number not recognised');
  if (b.consent !== 'yes') return reply('application/json', JSON.stringify({ ok: false, error: 'consent' }), [], 'Form: no consent tick');
  const key = hash(to);
  if (store.optedOut[key]) return reply('application/json', JSON.stringify({ ok: true }), [], 'Form: number opted out, nothing sent');
  if (store.sent[key] && now - store.sent[key] < Number(s.dedupe_minutes) * 60000)
    return reply('application/json', JSON.stringify({ ok: true }), [], 'Form: messaged recently, not sent again');

  const reason = REASONS[b.reason] || REASONS.other;
  const first = (String(b.first_name || '').match(/[A-Za-zÀ-ÿ'-]{1,30}/) || ['there'])[0];
  store.sent[key] = now;
  store.context[key] = { how: `left their number on the website about ${reason}`, at: now };
  const messages = [{ form: whatsappForm(s.whatsapp_from, to, fill(s.form_message, { ...values, first_name: first, reason }), s.content_sid_form, { 1: first, 2: s.practice_name }) }];
  if (s.frontdesk_whatsapp) messages.push({ form: whatsappForm(s.whatsapp_from, s.frontdesk_whatsapp, `Website enquiry at ${ukTime()} about ${reason}. WhatsApp sent to ${to}.`) });
  return reply('application/json', JSON.stringify({ ok: true }), messages, 'Form: WhatsApp sent');
}

// ---- Calls --------------------------------------------------------------------------------
const caller = String(b.From || '').trim();
const status = String(b.DialCallStatus || '');

// 1. A call has just come in and there is someone to ring first.
if (!status && s.forward_to) {
  const proto = (s.headers || {})['x-forwarded-proto'] || 'https';
  const host = (s.headers || {})['x-forwarded-host'] || (s.headers || {}).host;
  const prefix = String(s.webhookUrl || '').includes('/webhook-test/') ? 'webhook-test' : 'webhook';
  const action = `${s.public_base_url || `${proto}://${host}`}/${prefix}/missed-call/dial-status`;
  return reply('text/xml',
    `<Response><Dial timeout="${Number(s.ring_seconds) || 12}" action="${xml(action)}" method="POST"><Number>${xml(s.forward_to)}</Number></Dial></Response>`,
    [], 'Call: ringing the front desk');
}

// 2. The front desk picked up: nothing to do once the call ends.
if (status && !['no-answer', 'busy', 'failed', 'canceled'].includes(status))
  return reply('text/xml', '<Response><Hangup/></Response>', [], `Call answered (${status})`);

// 3. Missed. Text back if we can.
const to = WITHHELD.has(caller.toLowerCase()) ? null : e164(caller);
const key = to ? hash(to) : '';
const recent = key && store.sent[key] && now - store.sent[key] < Number(s.dedupe_minutes) * 60000;
const canText = to && !store.optedOut[key] && !recent;

const messages = [];
let note = 'Missed call: ';
if (canText) {
  store.sent[key] = now;
  store.context[key] = { how: 'rang the practice and the call was missed', at: now };
  messages.push({ form: whatsappForm(s.whatsapp_from, to, fill(s.missed_call_message, values), s.content_sid_missed, { 1: s.practice_name }) });
  note += 'WhatsApp sent';
} else note += !to ? 'number withheld, no WhatsApp' : store.optedOut[key] ? 'opted out, no WhatsApp' : 'messaged recently, not sent again';

if (s.frontdesk_whatsapp)
  messages.push({ form: whatsappForm(s.whatsapp_from, s.frontdesk_whatsapp,
    `Missed call at ${ukTime()} from ${to || 'a withheld number'}.${canText ? ' WhatsApp text-back sent.' : ''}`) });

const spoken = canText || recent ? s.missed_call_say : s.missed_call_say_no_text;
return reply('text/xml', `<Response>${say(fill(spoken, values))}<Hangup/></Response>`, messages, note);
