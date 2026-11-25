"""Writes ../n8n/consent-first-lead-capture.json from the readable pieces in ../n8n-code/ and ../prompts/.
Run: uv run python demos/consent-first-lead-capture-and-journey-t/scripts/build-workflow.py
     ... --local --sheet-id PASTE_ID   writes n8n/local/ (git-ignored) with your sheet's ID filled in, so you only import it.
Edit the Settings below (or in n8n after import), re-run, then re-import (see the README)."""

import argparse
import json
import uuid
from pathlib import Path

DEMO = Path(__file__).resolve().parents[1]
OUT = DEMO / "n8n" / "consent-first-lead-capture.json"
CODE = DEMO / "n8n-code"
HELPERS = (CODE / "_helpers.js").read_text()
TABS = [
    "Contacts",
    "Consent log",
    "Suppression",
    "Follow-up drafts",
]  # must match TABS in _helpers.js

SETTINGS = {
    # The Google Sheet: the long ID in its address, docs.google.com/spreadsheets/d/<this part>/edit
    "sheet_id": "CHANGE ME",
    # The team view sends this with every request. A real build puts the team view behind a login instead.
    "team_key": "demo-team-key",
    # Where the confirm and unsubscribe links point (n8n's production webhook address).
    "public_base_url": "http://localhost:5678/webhook/lead-capture",
    # The demo shows the confirm link on the page, because no email is sent. A real build emails it instead.
    "show_confirm_link_on_page": "yes",
    "confirm_days": "7",
    # The business (fictional) and who the follow-up notes are from
    "business_name": "Fernhollow Partners",
    "business_line": "a small consultancy that helps charities and social enterprises find sponsors and partners who share their aims.",
    "sender_name": "Jo Ashdown",
    "opt_out_line": "Reply 'no' and I won't email again.",
    # Exactly what each form shows next to its tick box or button. This copy, not the page's, is what the Consent log stores.
    "newsletter_form_version": "Website newsletter form v1 (Nov 2026)",
    "newsletter_wording": "Yes, send me the Fernhollow Partners newsletter (about once a month). I can unsubscribe at any time from any issue.",
    "enquiry_form_version": "Website enquiry form v1 (Nov 2026)",
    "enquiry_wording": "We'll use your details to reply to your enquiry, as set out in our privacy notice.",
    "linkedin_wording": "LinkedIn form tick box: I'd like to receive the Fernhollow Partners newsletter.",
    "linkedin_privacy_wording": "LinkedIn form privacy notice: Fernhollow Partners will use these details to follow up on your request.",
    # Journey rules (see stageOf in n8n-code/_helpers.js)
    "clicks_for_identified": "2",
    "clicks_for_opportunity": "5",
    # Follow-up drafts
    "model": "claude-haiku-5-5",
    "max_drafts_per_run": "10",
    "max_words": "90",
    "system_prompt": (DEMO / "prompts" / "follow-up-note.md").read_text().strip(),
}

_args = argparse.ArgumentParser(description="Build the n8n workflow file.")
_args.add_argument(
    "--local", action="store_true", help="write a copy with your sheet ID to n8n/local/"
)
_args.add_argument("--sheet-id", help="the Google Sheet's ID")
ARGS = _args.parse_args()
if ARGS.local:
    if not ARGS.sheet_id:
        raise SystemExit("--local needs --sheet-id <the long ID in the sheet's address>")
    SETTINGS["sheet_id"] = ARGS.sheet_id
    OUT = DEMO / "n8n" / "local" / "consent-first-lead-capture.local.json"


def uid(name: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "consent-first-lead-capture/" + name))


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


def webhook(name, path, method, pos):
    return node(
        name,
        "webhook",
        2,
        pos,
        {
            "httpMethod": method,
            "path": "lead-capture/" + path,
            "responseMode": "responseNode",
            "options": {"allowedOrigins": "*"},
        },
        webhookId=uid("hook/" + path),
    )


def code(name, file, pos, helpers=True):
    body = (CODE / file).read_text()
    return node(name, "code", 2, pos, {"jsCode": (HELPERS + "\n" + body) if helpers else body})


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


def sheets_call(name, method, url, pos, body=None):
    params = {
        "method": method,
        "url": url,
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "googleSheetsOAuth2Api",
        "options": {"timeout": 15000},
    }
    if body:
        params.update({"sendBody": True, "specifyBody": "json", "jsonBody": body})
    return node(name, "httpRequest", 4.2, pos, params)


def note(name, text, pos, w=480, h=260):
    return node(name, "stickyNote", 1, pos, {"content": text, "width": w, "height": h})


ranges = "&".join("ranges=" + "%27" + t.replace(" ", "%20") + "%27" for t in TABS)
SHEETS = "https://sheets.googleapis.com/v4/spreadsheets/"

nodes = [
    note(
        "About this workflow",
        "## Consent-first lead capture and journey tracker (demo)\n"
        "Every request reads the whole sheet once, works out the change in **Apply the change**, and writes it back in one call.\n\n"
        "- **Website forms**: newsletter sign-ups start *pending*; enquiries are logged with the reply basis.\n"
        "- **Confirm / Unsubscribe**: the link shows a button, the button makes the change.\n"
        "- **Team view**: LinkedIn CSV import, click report, unsubscribe on request, *Draft follow-ups* (Claude Haiku, to a review tab).\n\n"
        "Edit **Settings** first. Credentials: Google Sheets OAuth2 (on both sheet nodes) and Header Auth `x-api-key` (on Claude).",
        (-80, -460),
        620,
        320,
    ),
    note(
        "Privacy",
        "### What is kept\nContacts: name, organisation, role, address, consent and activity counts. Consent log: what each form said and when. "
        "Suppression: addresses that asked to stop, so no import adds them back. Nothing is emailed: the confirm link is shown on the demo page instead. "
        "Emails and phone numbers are masked before anything reaches the AI. Demo data only (example.com addresses).",
        (580, -460),
        440,
        320,
    ),
    webhook("Website forms", "signup", "POST", (0, 0)),
    webhook("Confirm link", "confirm", "GET", (0, 160)),
    webhook("Confirm button", "confirmed", "POST", (0, 320)),
    webhook("Unsubscribe link", "unsubscribe", "GET", (0, 480)),
    webhook("Unsubscribe button", "unsubscribed", "POST", (0, 640)),
    webhook("Team view", "team", "POST", (0, 800)),
    node(
        "Settings",
        "set",
        3.4,
        (260, 400),
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
    sheets_call(
        "Read the sheet",
        "GET",
        f"={SHEETS}{{{{ $json.sheet_id }}}}/values:batchGet?{ranges}",
        (480, 400),
    ),
    code("Apply the change", "apply-the-change.js", (700, 400)),
    is_true("Drafts to write?", "={{ $json.ai.length > 0 }}", (920, 400)),
    code("One item per draft", "one-item-per-draft.js", (1140, 240), helpers=False),
    node(
        "Ask Claude (Haiku)",
        "httpRequest",
        4.2,
        (1360, 240),
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
            "options": {"timeout": 30000},
        },
        onError="continueRegularOutput",
    ),
    code("Add the drafts", "add-the-drafts.js", (1580, 240)),
    code("Ready to save", "ready-to-save.js", (1800, 400), helpers=False),
    is_true("Anything to save?", "={{ $json.save }}", (2020, 400)),
    sheets_call(
        "Save to the sheet",
        "POST",
        f"={SHEETS}{{{{ $('Settings').first().json.sheet_id }}}}/values:batchUpdate",
        (2240, 320),
        "={{ JSON.stringify($json.write) }}",
    ),
    node(
        "Answer",
        "respondToWebhook",
        1.1,
        (2460, 400),
        {
            "respondWith": "text",
            "responseBody": "={{ $('Ready to save').first().json.response_body }}",
            "options": {
                "responseHeaders": {
                    "entries": [
                        {
                            "name": "Content-Type",
                            "value": "={{ $('Ready to save').first().json.response_type }}",
                        },
                        {"name": "Access-Control-Allow-Origin", "value": "*"},
                        {"name": "Cache-Control", "value": "no-store"},
                    ]
                }
            },
        },
    ),
]

links = [
    ("Website forms", "Settings"),
    ("Confirm link", "Settings"),
    ("Confirm button", "Settings"),
    ("Unsubscribe link", "Settings"),
    ("Unsubscribe button", "Settings"),
    ("Team view", "Settings"),
    ("Settings", "Read the sheet"),
    ("Read the sheet", "Apply the change"),
    ("Apply the change", "Drafts to write?"),
    ("Drafts to write?", "One item per draft", 0),
    ("Drafts to write?", "Ready to save", 1),
    ("One item per draft", "Ask Claude (Haiku)"),
    ("Ask Claude (Haiku)", "Add the drafts"),
    ("Add the drafts", "Ready to save"),
    ("Ready to save", "Anything to save?"),
    ("Anything to save?", "Save to the sheet", 0),
    ("Anything to save?", "Answer", 1),
    ("Save to the sheet", "Answer"),
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

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(
    json.dumps(
        {
            "id": "ConsentLeadCapt1",
            "name": "Consent-first lead capture and journey tracker (demo)",
            "nodes": nodes,
            "connections": conns,
            "settings": {"executionOrder": "v1"},
            "active": False,
            "pinData": {},
            "meta": {"note": "Demo. Fictional business and invented contacts only. Sends nothing."},
        },
        indent=2,
    )
    + "\n"
)
print("wrote", OUT.relative_to(DEMO))
