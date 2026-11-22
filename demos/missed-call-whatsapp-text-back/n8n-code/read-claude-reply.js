// Claude has answered. Pulls out the reply and saves it to the conversation. Claude fills three fields as
// the person mentions them; once all three are known (code decides, not the AI), the front desk gets a
// one-line summary, once per conversation.
const s = $('Settings').first().json;
const prep = $('Prepare the conversation').first().json;
const res = $input.first().json;
const store = $getWorkflowStaticData('global');
store.chats ??= {};

const text = (res.content || []).filter((part) => part.type === 'text').map((part) => part.text).join('');
let out = null;
try { out = JSON.parse(text); } catch {
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { out = JSON.parse(m[0]); } catch { out = null; } }
}
let message = String(out?.reply || '').trim().slice(0, 600);
if (!message || res.stop_reason === 'refusal') message = s.fallback_reply;

const chat = store.chats[prep.key] || { turns: [], handed_over: false };
chat.turns.push({ role: 'assistant', content: message });
chat.updated = Date.now();
store.chats[prep.key] = chat;

// Keep what is known across turns, so a field said earlier is never lost.
const field = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 80);
chat.known ??= {};
for (const k of ['patient', 'about', 'call_back']) if (field(out?.[k])) chat.known[k] = field(out[k]);
const { patient, about, call_back: callBack } = chat.known;

const messages = [];
let note = 'AI replied';
if (patient && about && callBack && !chat.handed_over) {
  chat.handed_over = true;
  note = 'AI replied and handed over';
  if (s.frontdesk_whatsapp)
    messages.push({ form: whatsappForm(s.whatsapp_from, s.frontdesk_whatsapp,
      `Call back request from ${prep.from}: ${patient} patient, about ${about}. Call ${callBack}.`) });
}
return [{ json: { response_type: 'text/xml', response_body: `<Response><Message>${xml(message)}</Message></Response>`, messages, note } }];
