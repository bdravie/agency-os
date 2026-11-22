"""Sets up Twilio for the missed-call demo through Twilio's API, so nothing needs clicking except Meta's sign-up.

  status                      numbers, WhatsApp senders and the demo's templates, with their approval state
  templates                   creates the two WhatsApp templates (once) and submits them for approval as Utility
  wire --url URL --number N [--sender S]   points number N's calls, the WhatsApp sender S (default N) and the
                              demo page's form at the n8n tunnel URL (run it again each time the tunnel restarts)

Run: uv run python demos/missed-call-whatsapp-text-back/scripts/twilio_setup.py status
Needs TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env. Nothing here buys a number or sends a message."""

import argparse
import base64
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from agency import config

# Must match the Settings in build-workflow.py: {{1}} and {{2}} are filled in that order by the workflow.
TEMPLATES = {
    "missed_call_text_back": {
        "body": "Hi, it's {{1}}. Sorry we missed your call, we're with a patient. Reply here with a good day and time "
        "and we'll call you back. Reply STOP and we won't message again.",
        "variables": {"1": "Brightmoor Dental"},
        "setting": "content_sid_missed",
    },
    "web_enquiry_reply": {
        "body": "Hi {{1}}, it's {{2}}. Thanks for leaving your number. What day and time suits you for a quick call back? "
        "Reply STOP and we won't message again.",
        "variables": {"1": "Sam", "2": "Brightmoor Dental"},
        "setting": "content_sid_form",
    },
}


def creds() -> tuple[str, str]:
    sid, token = config.get("TWILIO_ACCOUNT_SID"), config.get("TWILIO_AUTH_TOKEN")
    if not sid or not token:
        sys.exit(
            "Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env first (Twilio Console > Account info)."
        )
    return sid, token


def call(method: str, url: str, form: dict | None = None, body: dict | None = None) -> dict:
    sid, token = creds()
    headers = {"Authorization": "Basic " + base64.b64encode(f"{sid}:{token}".encode()).decode()}
    data = None
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:400]
        sys.exit(f"Twilio said {e.code} for {method} {url.split('?')[0]}: {detail}")


def numbers() -> list[dict]:
    sid, _ = creds()
    return call(
        "GET",
        f"https://api.twilio.com/2010-04-01/Accounts/{sid}/IncomingPhoneNumbers.json?PageSize=50",
    )["incoming_phone_numbers"]


def senders() -> list[dict]:
    return call(
        "GET", "https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp&PageSize=50"
    ).get("senders", [])


def demo_templates() -> dict[str, dict]:
    found = call("GET", "https://content.twilio.com/v1/Content?PageSize=100").get("contents", [])
    return {c["friendly_name"]: c for c in found if c.get("friendly_name") in TEMPLATES}


def approval(content_sid: str) -> str:
    res = call("GET", f"https://content.twilio.com/v1/Content/{content_sid}/ApprovalRequests")
    wa = res.get("whatsapp") or {}
    return f"{wa.get('status', 'not submitted')}{' (' + wa['rejection_reason'] + ')' if wa.get('rejection_reason') else ''}"


def template_sids() -> tuple[dict[str, str], list[str]]:
    """The n8n Settings for the templates WhatsApp has approved, and the names of those still waiting.
    An unapproved template cannot be sent, so build-workflow.py --local fills in only the approved ones."""
    ready, waiting = {}, []
    have = demo_templates()
    for name, t in TEMPLATES.items():
        c = have.get(name)
        if c and approval(c["sid"]).startswith("approved"):
            ready[t["setting"]] = c["sid"]
        else:
            waiting.append(name)
    return ready, waiting


PAGE = Path(__file__).resolve().parents[1] / "site" / "index.html"


def point_page(base: str) -> None:
    """Sets CONFIG.webhookUrl in site/index.html to the new tunnel's form address."""
    html = PAGE.read_text()
    new, count = re.subn(
        r"webhookUrl: '[^']*'", f"webhookUrl: '{base}/webhook/missed-call/form'", html, count=1
    )
    if not count:
        print("Could not find CONFIG.webhookUrl in site/index.html: set it by hand.")
        return
    PAGE.write_text(new)
    print(
        f"site/index.html now sends the form to {base}/webhook/missed-call/form (reload the page)"
    )


def status(_args) -> None:
    print("Phone numbers")
    for n in numbers():
        caps = ", ".join(k for k, v in (n.get("capabilities") or {}).items() if v)
        print(f"  {n['phone_number']}  [{caps}]  calls go to: {n.get('voice_url') or '(nothing)'}")
    print("\nWhatsApp senders")
    for s in senders() or [{}]:
        if not s:
            print("  none yet: register one in the Console (Set up a new WhatsApp sender)")
            continue
        hook = (s.get("webhook") or {}).get("callback_url") or "(nothing)"
        print(f"  {s.get('sender_id')}  {s.get('status')}  messages go to: {hook}")
    print("\nDemo templates")
    have = demo_templates()
    for name, t in TEMPLATES.items():
        c = have.get(name)
        print(
            f"  {name}: "
            + (
                f"{c['sid']}  WhatsApp approval: {approval(c['sid'])}  (n8n Settings: {t['setting']})"
                if c
                else "not created"
            )
        )


def templates(_args) -> None:
    have = demo_templates()
    for name, t in TEMPLATES.items():
        c = have.get(name) or call(
            "POST",
            "https://content.twilio.com/v1/Content",
            body={
                "friendly_name": name,
                "language": "en",
                "variables": t["variables"],
                "types": {"twilio/text": {"body": t["body"]}},
            },
        )
        state = approval(c["sid"])
        if state.startswith(
            ("not submitted", "unsubmitted")
        ):  # Twilio reports "unsubmitted" before approval is asked for
            call(
                "POST",
                f"https://content.twilio.com/v1/Content/{c['sid']}/ApprovalRequests/whatsapp",
                body={"name": name, "category": "UTILITY"},
            )
            state = approval(c["sid"])
        print(
            f"{name}: {c['sid']}  WhatsApp approval: {state}  -> put in n8n Settings as {t['setting']}"
        )


def wire(args) -> None:
    base = args.url.rstrip("/")
    if not base.startswith("https://"):
        sys.exit("--url must be the https tunnel address, e.g. https://abc-def.trycloudflare.com")
    target = "+" + "".join(ch for ch in args.number if ch.isdigit())
    sid, _ = creds()
    num = next((n for n in numbers() if n["phone_number"] == target), None)
    if not num:
        sys.exit(f"{target} is not one of this account's numbers. Run 'status' to see them.")
    call(
        "POST",
        f"https://api.twilio.com/2010-04-01/Accounts/{sid}/IncomingPhoneNumbers/{num['sid']}.json",
        form={"VoiceUrl": f"{base}/webhook/missed-call/voice", "VoiceMethod": "POST"},
    )
    print(f"Calls to {target} now go to {base}/webhook/missed-call/voice")
    point_page(base)
    # The WhatsApp sender is usually the same number; --sender names a different one.
    sender_number = "+" + "".join(ch for ch in (args.sender or target) if ch.isdigit())
    sender = next((s for s in senders() if s.get("sender_id") == f"whatsapp:{sender_number}"), None)
    if not sender:
        print(
            f"No WhatsApp sender for {sender_number} yet: register it in the Console, then run this again."
        )
        return
    call(
        "POST",
        f"https://messaging.twilio.com/v2/Channels/Senders/{sender['sid']}",
        body={
            "webhook": {
                "callback_url": f"{base}/webhook/missed-call/whatsapp",
                "callback_method": "POST",
            }
        },
    )
    print(
        f"WhatsApp messages to {sender_number} now go to {base}/webhook/missed-call/whatsapp (sender status: {sender.get('status')})"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status").set_defaults(run=status)
    sub.add_parser("templates").set_defaults(run=templates)
    w = sub.add_parser("wire")
    w.add_argument("--url", required=True)
    w.add_argument("--number", required=True)
    w.add_argument("--sender", help="the WhatsApp sender number, if not the same as --number")
    w.set_defaults(run=wire)
    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
