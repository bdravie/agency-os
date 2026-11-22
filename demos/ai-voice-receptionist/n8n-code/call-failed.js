// ElevenLabs could not place the call (wrong ID, no credit, number not allowed). The person was promised
// a call, so the front desk is told to ring them instead.
const s = $('Settings').first().json;
const req = $('Check the call-back request').first().json;
const messages = s.frontdesk_whatsapp
  ? [{ form: whatsappForm(s.whatsapp_from, s.frontdesk_whatsapp, `The assistant could not ring ${req.to} back. Please call them.`) }]
  : [];
return [{ json: { messages, note: 'Outbound call failed' } }];
