# Sample payloads (fake data)

What Twilio and the web page post to the n8n webhooks, with fake numbers from Ofcom's drama range (07700 900xxx). Use them to try the workflow without making a call. Replace `$N8N` with your tunnel address, for example `https://abc-def.trycloudflare.com`.

| File | Posted to | What it is |
|---|---|---|
| `incoming-call.txt` | `/webhook/missed-call/voice` | A call has just come in |
| `dial-status-no-answer.txt` | `/webhook/missed-call/dial-status` | The front desk did not pick up (only used when `forward_to` is set) |
| `web-form.txt` | `/webhook/missed-call/form` | The website form |
| `whatsapp-reply.txt` | `/webhook/missed-call/whatsapp` | The person replies on WhatsApp |

```
curl -s -X POST "$N8N/webhook/missed-call/voice" --data @demos/missed-call-whatsapp-text-back/sample-data/incoming-call.txt
```

The reply is the TwiML Twilio would read out. Messages to 07700 900xxx numbers fail at Twilio (they are not real), which is expected: put your own mobile in the file to receive a real one.
