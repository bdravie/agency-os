"""Writes ../n8n/missed-call-text-back.json from the readable pieces in ../n8n-code/ and ../prompts/.
Run: uv run python demos/missed-call-whatsapp-text-back/scripts/build-workflow.py
Edit the Settings below (or in n8n after import), re-run, then re-import (see the README)."""

import json
import uuid
from pathlib import Path

DEMO = Path(__file__).resolve().parents[1]
OUT = DEMO / "n8n" / "missed-call-text-back.json"
CODE = DEMO / "n8n-code"
HELPERS = (CODE / "_helpers.js").read_text()

SETTINGS = {
    # The practice (fictional for the demo; a client's own details for a real build)
    "practice_name": "Brightmoor Dental",
    "practice_phone": "0113 496 0123",
    "hours": "Monday to Friday 8am to 6pm, Saturday 9am to 1pm",
    "address": "12 Example Street, Leeds LS1 0AA",
    "booking_link": "",
    # Calls: ring this number first (E.164, e.g. +447700900123). Leave empty and every call counts as missed (best for filming).
    "forward_to": "",
    "ring_seconds": "12",
    "voice": "Polly.Amy",
    "public_base_url": "",
    # Twilio and WhatsApp. The sandbox sends from +14155238886.
    "twilio_account_sid": "CHANGE ME (starts AC)",
    "whatsapp_from": "+14155238886",
    "frontdesk_whatsapp": "",
    "content_sid_missed": "",
    "content_sid_form": "",
    "dedupe_minutes": "30",
    # What people hear and read. Booking logistics only. {placeholders} are filled in code.
    "missed_call_say": "Sorry, we can't get to the phone right now. We've just sent you a WhatsApp message so you can tell us a good time to call you back. Thank you.",
    "missed_call_say_no_text": "Sorry, we can't get to the phone right now. Please try again shortly. Thank you for calling {practice}.",
    "missed_call_message": "Hi, it's {practice}. Sorry we missed your call, we're with a patient. Reply here with a good day and time and we'll call you back.\nOr book online: {booking_link}\n\nReply STOP and we won't message again.",
    "form_message": "Hi {first_name}, it's {practice}. Thanks for leaving your number about {reason}. What day and time suits you for a quick call back?\n\nReply STOP and we won't message again.",
    "stop_reply": "Understood. You won't hear from us again on WhatsApp.",
    "fallback_reply": "Thanks for your message. Someone from the front desk will reply shortly.",
    # The WhatsApp assistant
    "model": "claude-haiku-5-5",
    "system_prompt": (DEMO / "prompts" / "whatsapp-receptionist.md").read_text().strip(),
}


def uid(name: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "missed-call-text-back/" + name))


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


def note(name, text, pos, w=480, h=260):
    return node(name, "stickyNote", 1, pos, {"content": text, "width": w, "height": h})


def is_true(name, expr, pos):
    return node(
        name,
        "if",
        2.2,
        pos,
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
                        "id": uid("if/" + name),
                        "leftValue": expr,
                        "rightValue": "",
                        "operator": {"type": "boolean", "operation": "true", "singleValue": True},
                    }
                ],
                "combinator": "and",
            },
            "options": {},
        },
    )


S = "$('Settings').first().json"
nodes = [
    note(
        "About this workflow",
        "## Missed call text-back, with a WhatsApp assistant\n**Calls and the form (top lane):** a call rings the front desk "
        "(`forward_to`) and, if nobody answers, the caller hears a short message and gets a WhatsApp straight away. "
        "The website form sends the same kind of WhatsApp.\n\n**WhatsApp replies (bottom lane):** when they reply, Claude Haiku "
        "asks one question at a time until it has a call-back time, then the front desk gets a one-line summary.\n\n"
        "Edit **Settings** first. Credentials: Twilio (Basic auth: Account SID / Auth Token) and Anthropic (Header auth: `x-api-key`).",
        (-60, -420),
        560,
        300,
    ),
    note(
        "Privacy",
        "### What is kept\nn8n keeps a **hash** of each number (not the number) for 24 hours to stop repeat messages, "
        "the STOP list, and the last 12 WhatsApp messages of a conversation with emails and numbers masked, deleted after 24 hours. "
        "Photos and files are never sent to the AI. Real client: data processing agreement first.",
        (560, -420),
        420,
        300,
    ),
    webhook("Incoming call (Twilio)", "missed-call/voice", (0, 0)),
    webhook("Ringing finished (Twilio)", "missed-call/dial-status", (0, 180)),
    webhook("Website form", "missed-call/form", (0, 360)),
    webhook("WhatsApp message in (Twilio)", "missed-call/whatsapp", (0, 640)),
    node(
        "Settings",
        "set",
        3.4,
        (260, 320),
        {
            "assignments": {
                "assignments": [
                    {"id": uid("set/" + k), "name": k, "value": v, "type": "string"}
                    for k, v in SETTINGS.items()
                ]
            },
            "includeOtherFields": True,
            "options": {},
        },
    ),
    node(
        "WhatsApp message?",
        "if",
        2.2,
        (480, 320),
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
                        "id": uid("if/wa"),
                        "leftValue": "={{ String($json.body?.From ?? '') }}",
                        "rightValue": "whatsapp:",
                        "operator": {"type": "string", "operation": "startsWith"},
                    }
                ],
                "combinator": "and",
            },
            "options": {},
        },
    ),
    # Lane 1: calls and the form
    code("Decide: ring, missed or form", "decide-call-or-form.js", (720, 100)),
    respond("Answer Twilio or the page", (980, 0)),
    code("One item per message (calls)", "one-item-per-message.js", (980, 200), helpers=False),
    # Lane 2: WhatsApp replies
    code("Prepare the conversation", "prepare-conversation.js", (720, 640)),
    is_true("Ask the AI?", "={{ $json.ask_ai }}", (940, 640)),
    node(
        "Ask Claude (Haiku)",
        "httpRequest",
        4.2,
        (1160, 560),
        {
            "method": "POST",
            "url": "https://api.anthropic.com/v1/messages",
            "authentication": "genericCredentialType",
            "genericAuthType": "httpHeaderAuth",
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [{"name": "anthropic-version", "value": "2023-06-01"}]
            },
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify($json.request) }}",
            "options": {"timeout": 10000},
        },
        onError="continueErrorOutput",
    ),
    code("Read Claude's reply", "read-claude-reply.js", (1380, 520)),
    code("Fallback reply", "fallback-reply.js", (1380, 720)),
    respond("Reply on WhatsApp", (1640, 640)),
    code("One item per message (WhatsApp)", "one-item-per-message.js", (1640, 820), helpers=False),
    # Shared: send
    node(
        "Send WhatsApp (Twilio)",
        "httpRequest",
        4.2,
        (1900, 300),
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
    ("Incoming call (Twilio)", "Settings"),
    ("Ringing finished (Twilio)", "Settings"),
    ("Website form", "Settings"),
    ("WhatsApp message in (Twilio)", "Settings"),
    ("Settings", "WhatsApp message?"),
    ("WhatsApp message?", "Prepare the conversation", 0),
    ("WhatsApp message?", "Decide: ring, missed or form", 1),
    ("Decide: ring, missed or form", "Answer Twilio or the page"),
    ("Decide: ring, missed or form", "One item per message (calls)"),
    ("One item per message (calls)", "Send WhatsApp (Twilio)"),
    ("Prepare the conversation", "Ask the AI?"),
    ("Ask the AI?", "Ask Claude (Haiku)", 0),
    ("Ask the AI?", "Reply on WhatsApp", 1),
    ("Ask Claude (Haiku)", "Read Claude's reply", 0),
    ("Ask Claude (Haiku)", "Fallback reply", 1),
    ("Read Claude's reply", "Reply on WhatsApp"),
    ("Read Claude's reply", "One item per message (WhatsApp)"),
    ("Fallback reply", "Reply on WhatsApp"),
    ("Fallback reply", "One item per message (WhatsApp)"),
    ("One item per message (WhatsApp)", "Send WhatsApp (Twilio)"),
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
            "id": "MissedCallTxtBk1",
            "name": "Missed call text-back (WhatsApp)",
            "nodes": nodes,
            "connections": conns,
            "settings": {"executionOrder": "v1"},
            "active": False,
            "pinData": {},
            "meta": {"note": "Demo. Fictional practice. Test with your own phone only."},
        },
        indent=2,
    )
    + "\n"
)
print("wrote", OUT.relative_to(DEMO))
