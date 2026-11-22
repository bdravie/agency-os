# AI voice receptionist

**Outcome:** every call to the clinic is answered, day or night. When the team are with clients, a voice assistant takes the caller's request and passes a ready-to-act call-back note to the front desk. Anyone who leaves their number on the website gets a call within seconds.

**Who it's for:** aesthetics clinics and dental practices where the people who answer the phone are also the people treating clients.

## How it works

1. **Inbound:** the clinic's Twilio number is imported into ElevenLabs and answered by an ElevenLabs agent (the prompt is in `agent/system-prompt.md`). It says it's an AI assistant and that the call is recorded.
2. It collects four things: first name, new or returning, what it's about, and a good time to call back. Booking logistics only: no treatment advice, prices or medical questions, and urgent problems go to NHS 111 or 999.
3. It calls the `send_booking_request` tool, which posts to n8n. n8n checks a shared secret, tidies the request, takes the caller's number from the call itself (the agent never asks for it), and WhatsApps the front desk one line.
4. **Speed to lead:** the website's *Have us call you* form posts to n8n, which asks ElevenLabs to ring that number straight away. The assistant opens with *"Hi Sam, it's the AI assistant at Lumen Skin Clinic, calling back about booking a consultation…"*

Guards in code: the consent tick is required, one call per number per 10 minutes, `daily_call_cap` (20) calls a day (when it's reached, the front desk is asked to ring instead), a failed call also alerts the front desk, and the tool refuses any request without the right `x-demo-secret`. n8n keeps numbers only as a hash.

## Files

| Path | What it is |
|---|---|
| `site/index.html` | The demo landing page (fictional Lumen Skin Clinic). Open it in a browser. |
| `agent/system-prompt.md`, `agent/tools.md` | What to paste into ElevenLabs: prompt, first message, overrides and the tool |
| `n8n/voice-receptionist.json` | The n8n workflow to import (built, don't edit by hand) |
| `n8n-code/*.js` | The Code nodes' JavaScript |
| `scripts/build-workflow.py`, `scripts/test-workflow.mjs` | Rebuild the workflow; 9 checks on its logic |
| `sample-data/` | Fake payloads for `curl` |

## Set it up (about 90 minutes the first time)

**What you need:** an ElevenLabs account, a Twilio number that can take and make calls, n8n on the Mac with `cloudflared`, and (for the front desk note) the Twilio WhatsApp sandbox from the other demo.

> **One number, one job.** When ElevenLabs imports a Twilio number, it points that number's calls at itself. A number can't run this demo and the missed-call text-back at the same time. Use two numbers, or switch between demos by re-pointing the number's webhook. A new UK number needs an approved regulatory bundle first, which takes up to 2 to 3 business days.

1. **The agent.** ElevenLabs > Agents > create a blank agent. Pick a British voice and a fast model. Paste the first message and `agent/system-prompt.md`. Under Security, switch on the **First message** override.
2. **The number.** ElevenLabs > Phone numbers > Import from Twilio (number, Account SID, Auth Token). Assign it to the agent. Note its **phone number ID**, and the **agent ID** from the agent's page.
3. **Tunnel and n8n**, as in the other demo: `cloudflared tunnel --url http://localhost:5678`, then `WEBHOOK_URL=https://….trycloudflare.com/ npx n8n`.
4. **Import** `demos/ai-voice-receptionist/n8n/voice-receptionist.json`.
5. **Credentials:** *Header Auth* with name `xi-api-key` and your ElevenLabs API key, on **Ask ElevenLabs to ring them**. *Basic Auth* (Twilio SID / token) on **Send WhatsApp (Twilio)**.
6. **Settings node:** `elevenlabs_agent_id`, `elevenlabs_phone_number_id`, `clinic_twilio_number` (in +44 form), a long random `tool_secret`, `twilio_account_sid`, and `frontdesk_whatsapp` (a phone that has joined the sandbox) to receive the notes. **Publish** the workflow.
7. **The tool:** add `send_booking_request` to the agent exactly as in `agent/tools.md`, with the tunnel address and your `tool_secret`.
8. **The page:** in `site/index.html`, set `CONFIG.phoneDisplay`/`phoneDial` to the imported number and `CONFIG.webhookUrl` to `https://….trycloudflare.com/webhook/voice-demo/call-me-back`.
9. **Test:** ring the number and book a call back; then use the form with your own mobile and answer the call.

Run `node demos/ai-voice-receptionist/scripts/test-workflow.mjs` to check the logic without n8n. After changing a `.js` file or the Settings in the builder, run `uv run python demos/ai-voice-receptionist/scripts/build-workflow.py` and import again.

## Running cost

- **ElevenLabs:** billed per call minute on your plan. A booking call is usually one to two minutes. Check the plan's minute allowance before a client pilot.
- **Twilio:** the number's monthly rental, plus inbound and outbound call minutes (calls the assistant makes to UK mobiles cost more than calls in). Check Twilio's voice pricing for the client's country.
- **WhatsApp note to the front desk:** one Twilio message per booking request.
- **Hosting:** £0 on the laptop for the demo. A client build needs n8n running all the time.

## What data it touches

**This handles callers' personal data** (voice, number, name and what they ask for). ElevenLabs records and transcribes calls, so for a real client a **data processing agreement and DPIA come first**, listing ElevenLabs, Twilio, the AI model provider and the n8n host as sub-processors. Set the agent's call and transcript retention to the shortest the clinic needs. The assistant always says it's an AI and that the call is recorded, and it keeps to booking logistics. The demo uses only your own phone.

## Making it real for a client

- Put their opening hours, address and any "we don't do that" services in the prompt. Prices stay out unless they want them read out.
- Decide with them what happens out of hours. The assistant can take requests at any hour, but the front desk note should say when the call came in.
- Add a post-call webhook from ElevenLabs if they want transcripts or summaries in their own system (only with the DPA in place).
- Before a client goes live, check Twilio's outbound-calling rules for the country and the caller ID shown.

## Using Make instead of n8n

Two *Custom webhook* scenarios: the form one calls ElevenLabs' outbound-call endpoint with *HTTP > Make a request* (header `xi-api-key`), and the tool one replies with *Webhook response* (JSON) and sends the WhatsApp. Make's webhook addresses are public, so no tunnel is needed. The rules to copy are in `n8n-code/`.
