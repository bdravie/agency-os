// The website's "Have us call you" form. Checks the request, then builds the ElevenLabs
// outbound-call request so the assistant rings the person within seconds.
// Guards: a usable number, the consent tick, one call per number per dedupe_minutes, and a daily cap
// (every call costs money, and a public form can be abused).
const s = $input.first().json;
const b = s.body || {};
const store = $getWorkflowStaticData('global');
store.calls ??= {}; store.day ??= { date: '', count: 0 };
const now = Date.now();
for (const k of Object.keys(store.calls)) if (now - store.calls[k] > DAY) delete store.calls[k];
const today = new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/London' });
if (store.day.date !== today) store.day = { date: today, count: 0 };

const answer = (ok, note, extra = {}) => [{ json: { place_call: false, response_type: 'application/json', response_body: JSON.stringify({ ok }), messages: [], note, ...extra } }];

const REASONS = {
  consultation: 'booking a consultation',
  followup: 'booking a follow-up',
  change: 'changing an appointment',
  other: 'your enquiry',
};

const to = e164(b.phone);
if (!to) return answer(false, 'Number not recognised');
if (b.consent !== 'yes') return answer(false, 'No consent tick');
const key = hash(to);
if (store.calls[key] && now - store.calls[key] < Number(s.dedupe_minutes) * 60000) return answer(true, 'Called this number recently, not calling again');
if (store.day.count >= Number(s.daily_call_cap)) {
  const messages = s.frontdesk_whatsapp
    ? [{ form: whatsappForm(s.whatsapp_from, s.frontdesk_whatsapp, `Call-back request from ${to} not placed: the daily limit of ${s.daily_call_cap} calls is reached. Please ring them.`) }]
    : [];
  return answer(true, 'Daily call cap reached', { messages });
}

store.calls[key] = now;
store.day.count += 1;
const first = (String(b.first_name || '').match(/[A-Za-zÀ-ÿ'-]{1,30}/) || [''])[0];
const reason = REASONS[b.reason] || REASONS.other;
const values = { clinic: s.clinic_name, first_name: first || 'there', reason };

const request = {
  agent_id: s.elevenlabs_agent_id,
  agent_phone_number_id: s.elevenlabs_phone_number_id,
  to_number: to,
  conversation_initiation_client_data: {
    conversation_config_override: { agent: { first_message: fill(s.call_back_first_message, values) } },
    dynamic_variables: { first_name: first, reason },
  },
};
return [{ json: { place_call: true, to, request, response_type: 'application/json', response_body: JSON.stringify({ ok: true }), messages: [], note: `Calling ${to.slice(0, -3)}***` } }];
