"""Build the Make.com scenario blueprint for the demo from make/demo-ids.json and the account's connections.

    uv run python demos/invoice-inbox-to-draw-request/scripts/build_blueprint.py           # write make/invoice-inbox.blueprint.json
    uv run python demos/invoice-inbox-to-draw-request/scripts/build_blueprint.py --create  # also create it in Make (inactive, on demand)

The saved file has `<CHECK_KEY>` in place of the key; only the copy sent to Make carries the real
value (INVOICE_DEMO_CHECK_KEY in .env). Creating never runs or schedules the scenario.
Module names and settings were checked against the scenario Make saved back (see README).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import make_api

from agency import config

DEMO = Path(__file__).resolve().parent.parent
NAME = "Invoice inbox to draw request (demo)"
LABEL_QUERY = "label:invoices-demo has:attachment filename:pdf"

# Tracker columns in order (TRACKER_HEADERS in apps-script/Logic.gs), as Make maps them by column index.
TRACKER_VALUES = [
    "{{1.date}}",  # Received
    "{{ifempty(1.fromEmail; 1.from.address)}}",  # Email from (the v4 trigger calls it fromEmail)
    "{{1.subject}}",  # Subject
    "{{6.name}}",  # File
    "{{6.webViewLink}}",  # Drive link
    "{{4.vendor}}",  # Vendor
    "{{4.invoice_number}}",  # Invoice no
    "{{4.invoice_date}}",  # Invoice date
    "{{4.amount}}",  # Amount
    "{{4.project}}",  # Project
    '{{join(4.unclear; "; ")}}',  # Extraction notes
    "New",  # Status (Notes, Draw no and Checked at are left for the sheet's script)
]


def connection_ids(c) -> dict[str, int]:
    team = make_api.teams(c)[0]["team_id"]
    out: dict[str, int] = {}
    for k in make_api.call(c, "GET", "/connections", params={"teamId": team})["connections"]:
        out.setdefault(k["accountName"], k["id"])
    need = ["google-email", "google-drive", "google", "anthropic-claude"]
    missing = [n for n in need if n not in out]
    if missing:
        raise SystemExit(f"Missing Make connections: {', '.join(missing)}")
    return out


def at(x: int) -> dict:
    return {"designer": {"x": x, "y": 0}}


def blueprint(ids: dict, conns: dict[str, int], check_key: str) -> dict:
    body = json.loads((DEMO / "make" / "claude-request-body.json").read_text())
    flow = [
        {
            "id": 1,
            # Gmail > Watch emails. `watchEmails` is the deprecated one (shown as "(NOT USED)");
            # these settings are what Make saved when the current module was set up by hand.
            "module": "google-email:triggerWatchNewEmails",
            "version": 4,
            "parameters": {
                "__IMTCONN__": conns["google-email"],
                "filterType": "gmailSearch",
                "q": LABEL_QUERY,
                "format": "full",
                "markSeen": False,
                "limit": 10,
            },
            "mapper": {},
            "metadata": at(0),
        },
        # Watch emails' own attachments came through with empty data (Claude: "PDF cannot be
        # empty", 17 Nov 2026), so each attachment is listed, then fetched through Gmail's API.
        # The module ids 9 and 10 are the ones the working scenario has; later modules map {{10.…}}.
        {
            "id": 2,
            "module": "google-email:listEmailAttachments",
            "version": 4,
            "parameters": {"__IMTCONN__": conns["google-email"]},
            "mapper": {"messageId": "{{1.id}}"},
            "metadata": at(300),
        },
        {
            "id": 9,
            "module": "google-email:makeAnApiCall",
            "version": 4,
            "parameters": {"__IMTCONN__": conns["google-email"]},
            "filter": {
                "name": "PDF only",
                # Either condition passes (OR): some mail apps send PDFs as octet-stream.
                "conditions": [
                    [{"a": "{{2.mimeType}}", "b": "application/pdf", "o": "text:equal"}],
                    [{"a": "{{lower(2.filename)}}", "b": ".pdf", "o": "text:contain"}],
                ],
            },
            "mapper": {
                "url": "/v1/users/me/messages/{{1.id}}/attachments/{{2.id}}",
                "method": "GET",
                "qs": [],
                "headers": [],
            },
            "metadata": at(600),
        },
        {
            # Gmail returns base64url; Claude and Drive want standard base64.
            "id": 10,
            "module": "util:SetVariable2",
            "version": 1,
            "parameters": {},
            "mapper": {
                "name": "pdf_base64",
                "scope": "roundtrip",
                "value": '{{replace(replace(9.body.data; "/-/g"; "+"); "/_/g"; "/")}}',
            },
            "metadata": at(900),
        },
        {
            "id": 3,
            "module": "anthropic-claude:makeAnApiCall",
            "version": 1,
            "parameters": {"__IMTCONN__": conns["anthropic-claude"]},
            "mapper": {
                "url": "/v1/messages",
                "method": "POST",
                "headers": [{"key": "content-type", "value": "application/json"}],
                "body": json.dumps(body, ensure_ascii=False),
            },
            "metadata": at(600),
        },
        {
            "id": 4,
            "module": "json:ParseJSON",
            "version": 1,
            "parameters": {},
            "mapper": {"json": '{{last(map(3.body.content; "text"; "type"; "text"))}}'},
            "metadata": at(900),
        },
        {
            "id": 5,
            "module": "google-drive:searchForFilesFolders",
            "version": 4,
            "parameters": {"__IMTCONN__": conns["google-drive"]},
            "mapper": {
                "select": "query",
                "query": (
                    f"'{ids['drive_root_folder_id']}' in parents and "
                    "mimeType = 'application/vnd.google-apps.folder' and "
                    "name contains '{{4.project}} - ' and trashed = false"
                ),
                "limit": 1,
                "destination": "drive",
                "retrieve": "folder",
            },
            "metadata": at(1200),
        },
        {
            "id": 6,
            "module": "google-drive:uploadAFile",
            "version": 4,
            "parameters": {"__IMTCONN__": conns["google-drive"]},
            "mapper": {
                "select": "map",
                "destination": "drive",
                "folderId": f'{{{{ifempty(5.id; "{ids["drive_needs_review_folder_id"]}")}}}}',
                "title": '{{4.invoice_date}} {{4.vendor}} {{ifempty(4.invoice_number; "no number")}}.pdf',
                "filename": '{{4.invoice_date}} {{4.vendor}} {{ifempty(4.invoice_number; "no number")}}.pdf',
                "data": '{{toBinary(10.pdf_base64; "base64")}}',
                "convert": False,
            },
            "metadata": at(1500),
        },
        {
            "id": 7,
            "module": "google-sheets:addRow",
            "version": 2,
            "parameters": {"__IMTCONN__": conns["google"]},
            "mapper": {
                # As Make saved it once the module was opened by hand.
                "mode": "map",
                "spreadsheetId": ids["tracker_spreadsheet_id"],
                "sheetId": "Tracker",
                "tableFirstRow": "A1:Z1",
                "insertUnformatted": False,
                "valueInputOption": "USER_ENTERED",
                "insertDataOption": "INSERT_ROWS",
                "values": {str(i): v for i, v in enumerate(TRACKER_VALUES)},
            },
            "metadata": at(1800),
        },
        {
            "id": 8,
            "module": "http:ActionSendData",
            "version": 3,
            "parameters": {"handleErrors": False, "useNewZLibDeCompress": True},
            "mapper": {
                "url": ids["web_app_url"],
                "method": "get",
                # Both are required: left out, the run fails with BundleValidationError
                # "Missing value of required parameter 'useQuerystring' / 'useMtls'" (21 Nov 2026).
                "useQuerystring": True,
                "useMtls": False,
                "qs": [{"name": "key", "value": check_key}],
                "followRedirect": True,
                "parseResponse": True,
                "serializeUrl": False,
                "shareCookies": False,
                "rejectUnauthorized": True,
                "followAllRedirects": False,
                "timeout": "",
                "gzip": True,
                "headers": [],
                "bodyType": "",
            },
            "metadata": at(2100),
        },
    ]
    return {
        "name": NAME,
        "flow": flow,
        "metadata": {
            "instant": False,
            "version": 1,
            "scenario": {
                "roundtrips": 1,
                "maxErrors": 3,
                "autoCommit": True,
                "autoCommitTriggerLast": True,
                "sequential": False,
                "confidential": False,
                "dataloss": False,
                "dlq": False,
                "slots": None,
            },
            "designer": {"orphans": []},
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the demo's Make blueprint.")
    ap.add_argument("--create", action="store_true", help="create it in Make (inactive, on demand)")
    args = ap.parse_args()
    ids = json.loads((DEMO / "make" / "demo-ids.json").read_text())
    with make_api.api() as c:
        conns = connection_ids(c)
        saved = blueprint(ids, conns, "<CHECK_KEY>")
        out = DEMO / "make" / "invoice-inbox.blueprint.json"
        out.write_text(json.dumps(saved, indent=2, ensure_ascii=False) + "\n")
        print(f"Saved {out.relative_to(DEMO.parent.parent)} (key replaced by <CHECK_KEY>)")
        if not args.create:
            return
        team = make_api.teams(c)[0]["team_id"]
        real = blueprint(ids, conns, config.require("INVOICE_DEMO_CHECK_KEY"))
        body = {
            "teamId": team,
            "blueprint": json.dumps(real),
            "scheduling": json.dumps({"type": "on-demand"}),
        }
        s = make_api.call(c, "POST", "/scenarios", params={"confirmed": "true"}, json=body)[
            "scenario"
        ]
        print(f"Created scenario {s['id']} {s['name']!r} (inactive, on demand)")


if __name__ == "__main__":
    main()
