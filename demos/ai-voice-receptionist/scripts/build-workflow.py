"""Writes ../n8n/voice-receptionist.json from the readable pieces in ../n8n-code/.
Run: uv run python demos/ai-voice-receptionist/scripts/build-workflow.py
Edit the Settings below (or in n8n after import), re-run, then re-import (see the README)."""

import json
import uuid
from pathlib import Path

DEMO = Path(__file__).resolve().parents[1]
OUT = DEMO / "n8n" / "voice-receptionist.json"
CODE = DEMO / "n8n-code"
HELPERS = (CODE / "_helpers.js").read_text()

SETTINGS = {
    "clinic_name": "Lumen Skin Clinic",
    # The Twilio number imported into ElevenLabs, in +44 form, so it is never mistaken for the caller.
    "clinic_twilio_number": "+441134960456",
    # ElevenLabs: Agents > your agent (agent ID), and Phone numbers > your number (phone number ID).
    "elevenlabs_agent_id": "CHANGE ME",
    "elevenlabs_phone_number_id": "CHANGE ME",
    # The assistant's first line when it rings someone back. {first_name}, {clinic}, {reason} are filled in code.
    "call_back_first_message": "Hi {first_name}, it's the AI assistant at {clinic}, calling back about {reason}. This call is recorded. Is now still a good time?",
    # The voice agent's tool sends this in an x-demo-secret header. Any long random text.
    "tool_secret": "CHANGE ME",
    "dedupe_minutes": "10",
    "daily_call_cap": "20",
    # Front desk heads-up on WhatsApp (optional). The sandbox sends from +14155238886.
    "twilio_account_sid": "CHANGE ME (starts AC)",
    "whatsapp_from": "+14155238886",
    "frontdesk_whatsapp": "",
}


def uid(name: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "voice-receptionist/" + name))


def node(name, kind, version, pos, params=None, **extra):
    return {
        "parameters": params or {},
        "id": uid(name),
        "name": name,
        "type": f"n8n-nodes-base.{kind}",
        "typeVersion": version,
        "position": list(pos),
        **extra,
    }


def webhook(name, path, pos):
    return node(
        name,
        "webhook",
        2,
        pos,
        {"httpMethod": "POST", "path": path, "responseMode": "responseNode", "options": {}},
        webhookId=uid("hook/" + path),
    )


def code(name, file, pos, helpers=True):
    body = (CODE / file).read_text()
    return node(name, "code", 2, pos, {"jsCode": (HELPERS + "\n" + body) if helpers else body})


def respond(name, pos):
    return node(
        name,
        "respondToWebhook",
        1.1,
        pos,
        {
            "respondWith": "text",
            "responseBody": "={{ $json.response_body }}",
            "options": {
                "responseHeaders": {
                    "entries": [{"name": "Content-Type", "value": "={{ $json.response_type }}"}]
                }
            },
        },
    )


def settings(name, pos):
    return node(
        name,
        "set",
        3.4,
        pos,
        {
            "assignments": {
                "assignments": [
                    {"id": uid(f"set/{name}/{k}"), "name": k, "value": v, "type": "string"}
                    for k, v in SETTINGS.items()
                ]
            },
            "includeOtherFields": True,
            "options": {},
        },
    )


S = "$('Settings').first().json"
nodes = [
    node(
        "About this workflow",
        "stickyNote",
        1,
        (-60, -380),
        {
            "width": 560,
            "height": 280,
            "content": "## AI voice receptionist\n**Top lane:** the website's *Have us call you* form asks ElevenLabs to ring the person back "
            "straight away (one call per number per 10 minutes, `daily_call_cap` a day).\n\n**Bottom lane:** the voice agent's "
            "`send_booking_request` tool lands here; the front desk gets a one-line request on WhatsApp.\n\n"
            "Credentials: ElevenLabs (Header auth: `xi-api-key`) and, for the WhatsApp heads-up, Twilio (Basic auth).",
        },
    ),
    webhook("Call-back form", "voice-demo/call-me-back", (0, 0)),
    webhook("Booking request (voice agent tool)", "voice-demo/booking-request", (0, 420)),
    settings("Settings", (240, 200)),
    node(
        "Which webhook?",
        "if",
        2.2,
        (460, 200),
        {
            "conditions": {
                "options": {
                    "caseSensitive": True,
                    "leftValue": "",
                    "typeValidation": "loose",
                    "version": 2,
                },
                "conditions": [
                    {
                        "id": uid("if/form"),
                        "leftValue": "={{ $json.body?.source ?? '' }}",
                        "rightValue": "web-form",
                        "operator": {"type": "string", "operation": "equals"},
                    }
                ],
                "combinator": "and",
            },
            "options": {},
        },
    ),
    code("Check the call-back request", "check-call-back-request.js", (700, 0)),
    respond("Answer the page", (940, -100)),
    node(
        "Place the call?",
        "if",
        2.2,
        (940, 80),
        {
            "conditions": {
                "options": {
                    "caseSensitive": True,
                    "leftValue": "",
                    "typeValidation": "loose",
                    "version": 2,
                },
                "conditions": [
                    {
                        "id": uid("if/call"),
                        "leftValue": "={{ $json.place_call }}",
                        "rightValue": "",
                        "operator": {"type": "boolean", "operation": "true", "singleValue": True},
                    }
                ],
                "combinator": "and",
            },
            "options": {},
        },
    ),
    node(
        "Ask ElevenLabs to ring them",
        "httpRequest",
        4.2,
        (1180, 0),
        {
            "method": "POST",
            "url": "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
            "authentication": "genericCredentialType",
            "genericAuthType": "httpHeaderAuth",
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify($json.request) }}",
            "options": {"timeout": 15000},
        },
        onError="continueErrorOutput",
    ),
    code("Call failed: tell the front desk", "call-failed.js", (1420, 100)),
    code("One item per message (form)", "one-item-per-message.js", (1180, 200), helpers=False),
    code("Word the booking request", "booking-request.js", (700, 420)),
    respond("Answer the voice agent", (940, 340)),
    code("One item per message (agent)", "one-item-per-message.js", (940, 520), helpers=False),
    node(
        "Send WhatsApp (Twilio)",
        "httpRequest",
        4.2,
        (1660, 300),
        {
            "method": "POST",
            "url": f"=https://api.twilio.com/2010-04-01/Accounts/{{{{ {S}.twilio_account_sid }}}}/Messages.json",
            "authentication": "genericCredentialType",
            "genericAuthType": "httpBasicAuth",
            "sendBody": True,
            "contentType": "raw",
            "rawContentType": "application/x-www-form-urlencoded",
            "body": "={{ $json.form }}",
            "options": {},
        },
    ),
]

links = [
    ("Call-back form", "Settings"),
    ("Booking request (voice agent tool)", "Settings"),
    ("Settings", "Which webhook?"),
    ("Which webhook?", "Check the call-back request", 0),
    ("Which webhook?", "Word the booking request", 1),
    ("Check the call-back request", "Answer the page"),
    ("Check the call-back request", "Place the call?"),
    ("Place the call?", "Ask ElevenLabs to ring them", 0),
    ("Place the call?", "One item per message (form)", 1),
    ("Ask ElevenLabs to ring them", "Call failed: tell the front desk", 1),
    ("Call failed: tell the front desk", "One item per message (form)"),
    ("One item per message (form)", "Send WhatsApp (Twilio)"),
    ("Word the booking request", "Answer the voice agent"),
    ("Word the booking request", "One item per message (agent)"),
    ("One item per message (agent)", "Send WhatsApp (Twilio)"),
]

conns: dict = {}
for src, dst, *out in links:
    outputs = conns.setdefault(src, {"main": []})["main"]
    index = out[0] if out else 0
    while len(outputs) <= index:
        outputs.append([])
    outputs[index].append({"node": dst, "type": "main", "index": 0})

names = {n["name"] for n in nodes}
assert all(s in names and d in names for s, d, *_ in links), (
    "a link names a node that does not exist"
)

OUT.parent.mkdir(exist_ok=True)
OUT.write_text(
    json.dumps(
        {
            "id": "VoiceReceptnst01",
            "name": "AI voice receptionist (call-backs and booking requests)",
            "nodes": nodes,
            "connections": conns,
            "settings": {"executionOrder": "v1"},
            "active": False,
            "pinData": {},
            "meta": {"note": "Demo. Fictional clinic. Test with your own phone only."},
        },
        indent=2,
    )
    + "\n"
)
print("wrote", OUT.relative_to(DEMO))
