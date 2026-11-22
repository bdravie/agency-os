// The voice agent's send_booking_request tool. Checks the shared secret, tidies what the agent
// collected, works out the caller's number, and words a one-line request for the front desk.
// The reply tells the agent what to say next.
const s = $input.first().json;
const b = s.body || {};
const headers = s.headers || {};
const tell = (result, say, messages = [], note = '') =>
  [{ json: { response_type: 'application/json', response_body: JSON.stringify({ result, say }), messages, note } }];

if (!s.tool_secret || s.tool_secret.startsWith('CHANGE ME') || headers['x-demo-secret'] !== s.tool_secret)
  return tell('refused', 'Apologise and say the team will call them back on this number today.', [], 'Wrong or missing x-demo-secret');

// Never pass on contact details or long free text from the conversation.
const clean = (v, max) => String(v || '')
  .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '')
  .replace(/\+?\d[\d\s().-]{8,}\d/g, '')
  .replace(/\s+/g, ' ').trim().slice(0, max);

const clinic = e164(s.clinic_twilio_number);
const number = [b.caller_id, b.called_number].map(e164).find((n) => n && n !== clinic) || null;
const first = (clean(b.first_name, 30).match(/[A-Za-zÀ-ÿ'-]{1,30}/) || ['Caller'])[0];
const type = /exist|before|been/i.test(b.patient_type) ? 'existing' : /new|first/i.test(b.patient_type) ? 'new' : 'unknown';
const about = clean(b.about, 80) || 'not given';
const when = clean(b.preferred_time, 60) || 'as soon as possible';

const line = `Call back request (phone assistant): ${first}, ${type} client, about ${about}. Call ${when}${number ? ` on ${number}` : ', number not available (check ElevenLabs)'}.`;
const messages = s.frontdesk_whatsapp ? [{ form: whatsappForm(s.whatsapp_from, s.frontdesk_whatsapp, line) }] : [];
return tell('sent', `The team has the request and will call back ${when}.`, messages, line);
