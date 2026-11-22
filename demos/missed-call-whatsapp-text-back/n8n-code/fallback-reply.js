// Claude could not be reached (no key, timeout, outage). The person still gets a polite answer
// and the front desk is told, so nobody is left waiting.
const s = $('Settings').first().json;
const prep = $('Prepare the conversation').first().json;
const messages = [];
if (s.frontdesk_whatsapp)
  messages.push({ form: whatsappForm(s.whatsapp_from, s.frontdesk_whatsapp,
    `WhatsApp from ${prep.from} needs a reply (the assistant could not answer).`) });
return [{ json: { response_type: 'text/xml', response_body: `<Response><Message>${xml(s.fallback_reply)}</Message></Response>`, messages, note: 'AI unavailable: fallback reply' } }];
