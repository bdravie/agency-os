// A WhatsApp message has come in. Handles STOP and START, photos and files, and otherwise
// builds the request for Claude from the last few messages (kept for 24 hours, emails and numbers masked).
const s = $input.first().json;
const b = s.body || {};
const store = $getWorkflowStaticData('global');
store.chats ??= {}; store.optedOut ??= {}; store.context ??= {};
const now = Date.now();
for (const k of Object.keys(store.chats)) if (now - store.chats[k].updated > DAY) delete store.chats[k];

const from = e164(String(b.From || '').replace(/^whatsapp:/, ''));
const key = hash(from || 'unknown');
const text = String(b.Body || '').trim().slice(0, 1000);
const twiml = (message) => `<Response><Message>${xml(message)}</Message></Response>`;
const done = (message, note) => [{ json: { ask_ai: false, response_type: 'text/xml', response_body: twiml(message), messages: [], note } }];

if (/^(stop|unsubscribe|stop all)\W*$/i.test(text)) {
  store.optedOut[key] = now;
  delete store.chats[key]; delete store.context[key];
  return done(s.stop_reply, 'Opted out');
}
if (/^start\W*$/i.test(text)) {           // the person asked to hear from us again
  delete store.optedOut[key];
  return done(`Thanks, you're back on. How can we help?`, 'Opted back in');
}
if (store.optedOut[key]) return [{ json: { ask_ai: false, response_type: 'text/xml', response_body: '<Response/>', messages: [], note: 'Opted out: no reply' } }];
if (!text) return done(`Thanks. I can't open photos or files here, but the front desk will see it.`, 'Media only');

// Emails and phone numbers never go to the AI.
const masked = text
  .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email removed]')
  .replace(/\+?\d[\d\s().-]{8,}\d/g, '[number removed]');

const chat = store.chats[key] || { turns: [], updated: now, handed_over: false };
chat.turns.push({ role: 'user', content: masked });
chat.turns = chat.turns.slice(-12);
while (chat.turns.length && chat.turns[0].role !== 'user') chat.turns.shift();
chat.updated = now;
store.chats[key] = chat;

const values = {
  practice: s.practice_name, phone: s.practice_phone, hours: s.hours, address: s.address,
  booking_link: s.booking_link || 'none, the front desk books by phone',
  context: store.context[key]?.how || 'messaged the practice on WhatsApp',
};
const request = {
  model: s.model,
  max_tokens: 1024,
  output_config: {
    effort: 'low',
    format: { type: 'json_schema', schema: {
      type: 'object',
      properties: {
        reply: { type: 'string' },
        patient: { type: 'string', enum: ['', 'new', 'existing'] },
        about: { type: 'string' },
        call_back: { type: 'string' },
      },
      required: ['reply', 'patient', 'about', 'call_back'], additionalProperties: false } },
  },
  system: fill(s.system_prompt, values),
  messages: chat.turns,
};
return [{ json: { ask_ai: true, key, from, request } }];
