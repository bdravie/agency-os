// Shared helpers, added to the top of every Code node by scripts/build-workflow.py.
// n8n Code nodes cannot import from each other, so each node gets its own copy.

// A UK or international number in E.164 (+447700900123), or null if it is not a usable number.
const e164 = (raw) => {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('00')) d = '+' + d.slice(2);
  else if (d.startsWith('0')) d = '+44' + d.slice(1);
  else if (/^44\d/.test(d)) d = '+' + d;
  return /^\+[1-9]\d{7,14}$/.test(d) ? d : null;
};

// Twilio's stand-ins for a withheld number: never try to message these.
const WITHHELD = new Set(['+266696687', '+86282452253', '+8656696', '+2562533', 'anonymous', 'restricted', 'unknown']);

// Numbers are kept in n8n's memory as a short hash, never as the number itself.
const hash = (text) => {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
};

// Safe text inside TwiML.
const xml = (t) => String(t).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

// Fill {placeholders}. A line holding {booking_link} is dropped when there is no booking link.
const fill = (template, values) => String(template)
  .split('\n')
  .filter((line) => values.booking_link || !line.includes('{booking_link}'))
  .join('\n')
  .replace(/\{(\w+)\}/g, (match, key) => (values[key] ?? match));

// One Twilio "send a WhatsApp" request body (form-encoded). A template (ContentSid) is needed outside the 24-hour window.
const whatsappForm = (from, to, body, contentSid, contentVariables) => {
  const fields = { From: 'whatsapp:' + from, To: 'whatsapp:' + to };
  if (contentSid) { fields.ContentSid = contentSid; fields.ContentVariables = JSON.stringify(contentVariables || {}); }
  else fields.Body = body;
  return Object.entries(fields).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
};

// "14:05" in UK time.
const ukTime = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });

const DAY = 24 * 60 * 60 * 1000;
