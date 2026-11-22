// One item per WhatsApp to send. No messages means no items, so the Twilio step does not run.
return ($input.first().json.messages || []).map((m) => ({ json: m }));
