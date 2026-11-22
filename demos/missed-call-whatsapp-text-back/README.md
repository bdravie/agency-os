# Missed-call WhatsApp text-back

**Outcome:** a caller the front desk can't answer is never left on voicemail. Within seconds they get a WhatsApp from the practice, an assistant arranges a good time to call back, and the front desk gets a one-line note of who to ring and when.

**Who it's for:** dental practices and aesthetics clinics with a busy front desk (the clinic offer, *Missed-call and enquiry recovery*). It suits any business that misses calls while with a customer.

## How it works

1. A call to the practice's number rings the front desk first (`forward_to`, 12 seconds). With no `forward_to`, every call counts as missed, which is best for filming.
2. If nobody answers, the caller hears one sentence ("we've just sent you a WhatsApp…") and the call ends.
3. n8n sends the caller a WhatsApp at the same moment. The website's *Leave your number* form sends the same kind of message.
4. When they reply, Claude Haiku asks one question at a time: new or existing patient, what it's about, and a good time to call. It never gives clinical advice, and it points urgent cases to the practice or NHS 111.
5. Once all three are known (code checks this, not the AI), the front desk gets a WhatsApp: *"Call back request from +44…: existing patient, about sore tooth. Call any day after 4."*

Guards in code: withheld numbers are never messaged, one text-back per number per 30 minutes, STOP blocks all future messages (START undoes it), photos are never sent to the AI, emails and phone numbers are masked before the AI sees a message, and a failed AI call still gets a polite reply and a heads-up to the front desk.

## Files

| Path | What it is |
|---|---|
| `site/index.html` | The demo landing page (fictional Brightmoor Dental). Open it in a browser. |
| `n8n/missed-call-text-back.json` | The n8n workflow to import (built, don't edit by hand) |
| `n8n-code/*.js` | The Code nodes' JavaScript, readable and editable |
| `prompts/whatsapp-receptionist.md` | What the WhatsApp assistant is told |
| `scripts/build-workflow.py` | Rebuilds the workflow from the two folders above and the Settings at its top |
| `scripts/test-workflow.mjs` | 15 checks on the Code nodes, no n8n or network needed |
| `sample-data/` | Fake Twilio and form payloads for `curl` |

## Set it up (about 90 minutes the first time)

**What you need:** a Twilio account with a number that can take calls, an Anthropic API key, n8n on the Mac, and `cloudflared` for a public address.

> **The UK number catch.** A new UK Twilio number needs an approved regulatory bundle (ID and address), which Twilio says takes up to 2 to 3 business days. If you don't already have one, use a number you already own for tonight, or buy a US number (no bundle needed for voice; calling it from a UK mobile costs an international call).

1. **WhatsApp sandbox.** Twilio Console > Messaging > Try it out > Send a WhatsApp message. From your phone, send `join <your-code>` to +1 415 523 8886. The sandbox session lasts 3 days, then you join again. The sandbox only delivers a free-form message within 24 hours of your last message to it, so **send it any message just before you record.**
2. **A public address.** In one Terminal tab: `cloudflared tunnel --url http://localhost:5678`. Copy the `https://….trycloudflare.com` address it prints (it changes each run).
3. **n8n.** In a second tab, from the project folder: `WEBHOOK_URL=https://….trycloudflare.com/ npx n8n`, then open http://localhost:5678.
4. **Import:** `npx n8n import:workflow --input=demos/missed-call-whatsapp-text-back/n8n/missed-call-text-back.json` (or use *Import from file* in n8n).
5. **Credentials** (n8n > Credentials > New):
   - *Basic Auth*: user = Twilio Account SID, password = Twilio Auth Token. Pick it on **Send WhatsApp (Twilio)**.
   - *Header Auth*: name `x-api-key`, value = your Anthropic key. Pick it on **Ask Claude (Haiku)**.
6. **Settings node:** set `twilio_account_sid`. Optional: `forward_to` (a phone to ring first), `frontdesk_whatsapp` (a second phone that has joined the sandbox, to show the front desk's view), `booking_link`.
7. **Publish** the workflow (top right). Its webhooks only answer on the `/webhook/` addresses once published.
8. **Twilio wiring:**
   - Phone Numbers > your number > Voice > *A call comes in*: Webhook, `https://….trycloudflare.com/webhook/missed-call/voice`, HTTP POST.
   - Messaging > Try it out > WhatsApp sandbox settings > *When a message comes in*: `https://….trycloudflare.com/webhook/missed-call/whatsapp`, POST.
9. **The page:** in `site/index.html`, set `CONFIG.phoneDisplay` and `CONFIG.phoneDial` to your Twilio number and `CONFIG.webhookUrl` to `https://….trycloudflare.com/webhook/missed-call/form`. Double-click the file to open it. Press **T** (or *Test panel*) to see what the form sent.
10. **Test:** ring the number from your mobile, reply to the WhatsApp, then try the form. n8n > Executions shows every step.

Before importing, you can check the logic with `node demos/missed-call-whatsapp-text-back/scripts/test-workflow.mjs`. After changing a `.js` file, the prompt or the Settings in the builder, run `uv run python demos/missed-call-whatsapp-text-back/scripts/build-workflow.py` and import again.

## Running cost

- **AI:** one Claude Haiku call per WhatsApp reply, about 1,200 tokens in and 90 out (measured on 22 Nov 2026), so a few hundredths of a penny per reply.
- **Twilio:** the number's monthly rental, inbound call minutes, and a per-message WhatsApp fee. Outside the 24-hour window, Meta also charges per template message. Check Twilio's voice and WhatsApp pricing pages for the client's country before quoting.
- **Hosting:** £0 on the laptop for the demo. A client build needs n8n running all the time (n8n Cloud, or a small server).

## What data it touches

**This handles a clinic's patients' personal data** (phone numbers and what they write), so for a real client it is pitched as a conversation, and a **data processing agreement and DPIA come first**, with Twilio, Meta (WhatsApp), Anthropic and the n8n host listed as sub-processors. The demo uses only your own phone.

What n8n keeps: a hash of each number (never the number) for 24 hours, the STOP list, and the last 12 messages of a conversation with emails and numbers masked, deleted after 24 hours. The assistant sticks to booking logistics: no clinical questions, treatments or medicines.

## Making it real for a client

- **Their own WhatsApp sender:** register the practice's number as a WhatsApp sender in Twilio (Meta Business verification and display name approval take days), then get a *Utility* template approved and put its SID in `content_sid_missed` and `content_sid_form` (missed call: variable 1 = practice name; form: 1 = first name, 2 = practice name).
- **Their phone line:** keep their number and set *forward on no answer* to the Twilio number (the code depends on their phone provider), or port the number to Twilio.
- **Security:** check Twilio's request signature (`X-Twilio-Signature`) before trusting a webhook. The tunnel's random address is fine for a demo, not for a client.
- **Hours:** add the practice's opening hours to the Settings so out-of-hours callers hear a different line.

## Using Make instead of n8n

Make's webhooks are public straight away, so there's no tunnel. Rebuild it as: three *Custom webhook* triggers (voice, form, WhatsApp) > *Router* > *Webhook response* with the TwiML as the body and a `Content-Type: text/xml` header > Twilio *Create a message* (or HTTP to the Messages API) > *Anthropic Claude* for replies, with a *Data store* for the STOP list and the 30-minute check. The logic to copy is in `n8n-code/`.
