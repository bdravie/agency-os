"""Writes the three n8n workflow files in ../n8n/ from one readable description, so they stay in step.
Run: uv run python demos/event-listing-to-social-post-queue/scripts/build-workflows.py
Edit here, re-run, then re-import into n8n (see the README)."""

import json
import uuid
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "n8n"
HELPER = "http://127.0.0.1:8787"
IDS = {"queue": "EvtSocialQueue01", "publish": "EvtSocialPublsh2", "errors": "EvtSocialErrors3"}


def uid(name: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "event-social/" + name))


def node(name, kind, version, pos, params=None, **extra):
    return {"parameters": params or {}, "id": uid(name), "name": name, "type": f"n8n-nodes-base.{kind}",
            "typeVersion": version, "position": list(pos), **extra}


def http(name, pos, method, url, body=None, form=None, headers=None, catch=False):
    p = {"method": method, "url": url, "options": {}}
    if headers:
        p |= {"sendHeaders": True, "headerParameters": {"parameters": [{"name": k, "value": v} for k, v in headers.items()]}}
    if body:
        p |= {"sendBody": True, "specifyBody": "json", "jsonBody": body}
    if form:
        p |= {"sendBody": True, "contentType": "form-urlencoded",
              "bodyParameters": {"parameters": [{"name": k, "value": v} for k, v in form.items()]}}
    return node(name, "httpRequest", 4.2, pos, p, **({"onError": "continueErrorOutput"} if catch else {}))


def settings(pos, values):
    return node("Settings", "set", 3.4, pos, {"assignments": {"assignments": [
        {"id": uid("set/" + k), "name": k, "value": v, "type": "string"} for k, v in values.items()]}, "options": {}})


def every(name, pos, minutes):
    return node(name, "scheduleTrigger", 1.2, pos, {"rule": {"interval": [{"field": "minutes", "minutesInterval": minutes}]}})


def note(text, pos, w=460, h=300):
    return node("Note", "stickyNote", 1, pos, {"content": text, "width": w, "height": h})


def workflow(key, name, nodes, links, error_workflow=True):
    conns: dict = {}
    for src, dst, *out in links:
        outputs = conns.setdefault(src, {"main": []})["main"]
        index = out[0] if out else 0
        while len(outputs) <= index:
            outputs.append([])
        outputs[index].append({"node": dst, "type": "main", "index": 0})
    s = {"executionOrder": "v1"} | ({"errorWorkflow": IDS["errors"]} if error_workflow else {})
    wf = {"id": IDS[key], "name": name, "nodes": nodes, "connections": conns, "settings": s, "active": False, "pinData": {},
          "meta": {"note": "Demo. Runs against local stand-ins on 127.0.0.1:8787 with made-up events. Nothing is posted anywhere real."}}
    file = OUT / f"{list(IDS).index(key) + 1}-{name.split(': ')[1].lower().replace(' ', '-')}.json"
    file.write_text(json.dumps(wf, indent=2) + "\n")
    print("wrote", file.name)


S = "$('Settings').first().json"
PICK = "Pick new published events"
fail = lambda step, src: (
    '={{ JSON.stringify({ event_id: String(' + src + '.post_id ?? ' + src + '.event_id ?? ""), event: ' + src + '.post_title ?? ' + src + '.title ?? "", '
    'step: "' + step + '", error: ($json.error?.message ?? $json.error ?? "Unknown error").toString(), workflow: $workflow.name }) }}')

# 1. New published events -> posts + image card -> approval queue (Pending)
workflow("queue", "Event social demo: New events to approval queue", [
    note("## Demo: new events to approval queue\nEvery 5 minutes: read the directory's listings, keep the ones that are **published** and not already "
         "queued, posted or failed, write the posts, draw the image card, add a **Pending** row to the approval queue.\n\n"
         "**For a real build, swap:** the feed URL and key for the site's Brilliant Directories API (key in an n8n credential), "
         "and the three /sheet calls for Google Sheets nodes. The link is added by code, never by the AI.", (-40, -360)),
    every("Every 5 minutes", (0, 0), 5),
    node("Run now", "manualTrigger", 1, (0, 200)),
    settings((220, 100), {"directory_api": f"{HELPER}/api/v2", "directory_api_key": "demo-directory-key", "helper_url": HELPER, "sheet_url": f"{HELPER}/sheet"}),
    http("Get published-listings feed", (440, 100), "GET", f"={{{{ {S}.directory_api }}}}/data_posts/get?limit=100",
         headers={"X-Api-Key": f"={{{{ {S}.directory_api_key }}}}"}),
    http("Read approval queue", (660, 100), "GET", f"={{{{ {S}.sheet_url }}}}/queue"),
    http("Read Posted log", (880, 100), "GET", f"={{{{ {S}.sheet_url }}}}/posted"),
    http("Read Failures tab", (1100, 100), "GET", f"={{{{ {S}.sheet_url }}}}/failures"),
    node(PICK, "code", 2, (1320, 100), {"jsCode": """// Keep listings that are published and that we have not handled before.
// "Handled" = already in the approval queue, the Posted log or the Failures tab
// (a failure is logged once, not every five minutes; clear its row to retry).
const feed = $('Get published-listings feed').first().json.message || [];
const ids = (name) => ($(name).first().json.rows || []).map((r) => String(r.event_id));
const seen = new Set([...ids('Read approval queue'), ...ids('Read Posted log'), ...ids('Read Failures tab')]);

const fresh = [];
for (const listing of feed) {
  const id = String(listing.post_id);
  if (Number(listing.post_status) !== 1) continue; // not published yet: ignore
  if (seen.has(id)) continue;                      // handled before, or repeated in this feed
  seen.add(id);
  fresh.push({ json: listing });
}
return fresh;"""}),
    http("Write Facebook and Instagram posts", (1540, 100), "POST", f"={{{{ {S}.helper_url }}}}/helper/write-post", body="={{ JSON.stringify($json) }}", catch=True),
    http("Draw image card", (1760, 100), "POST", f"={{{{ {S}.helper_url }}}}/helper/render-card", body="={{ JSON.stringify($json) }}", catch=True),
    http("Add to approval queue as Pending", (1980, 100), "POST", f"={{{{ {S}.sheet_url }}}}/queue",
         body="={{ JSON.stringify({ event_id: String($json.post_id), title: $json.post_title, event_date: $json.post_start_date, facebook_post: $json.facebook_post, "
              "instagram_caption: $json.instagram_caption, image_url: $json.image_url, link: $json.post_url, written_by: $json.written_by }) }}"),
    http("Log failure: writing posts", (1760, 320), "POST", f"={{{{ {S}.sheet_url }}}}/failures", body=fail("Write posts", "$json")),
    http("Log failure: image card", (1980, 320), "POST", f"={{{{ {S}.sheet_url }}}}/failures", body=fail("Draw image card", "$json")),
], [
    ("Every 5 minutes", "Settings"), ("Run now", "Settings"), ("Settings", "Get published-listings feed"),
    ("Get published-listings feed", "Read approval queue"), ("Read approval queue", "Read Posted log"),
    ("Read Posted log", "Read Failures tab"), ("Read Failures tab", PICK), (PICK, "Write Facebook and Instagram posts"),
    ("Write Facebook and Instagram posts", "Draw image card"), ("Write Facebook and Instagram posts", "Log failure: writing posts", 1),
    ("Draw image card", "Add to approval queue as Pending"), ("Draw image card", "Log failure: image card", 1),
])

# 2. Approved rows -> Facebook Page (mock Graph API) -> Posted log
ROW = "$('Skip anything already posted').item.json"
workflow("publish", "Event social demo: Publish approved posts", [
    note("## Demo: publish approved posts\nEvery minute: read rows set to **Approved**. Anything already in the Posted log is skipped. "
         "The rest go to the Page with Meta's photo-post call (`POST /{page-id}/photos`, `url` + `caption`), then the event ID is logged.\n\n"
         "**In this demo** `graph_url` points at a local mock with the same parameters, replies and error shape, and the token is made up. "
         "**For a real build:** `https://graph.facebook.com/v27.0`, a Page access token in an n8n credential, and an image link Meta can reach. "
         "Instagram is prepared in the same shape but not sent.", (-40, -380), 460, 320),
    every("Every minute", (0, 0), 1),
    node("Run now", "manualTrigger", 1, (0, 200)),
    settings((220, 100), {"sheet_url": f"{HELPER}/sheet", "graph_url": f"{HELPER}/graph/v27.0", "page_id": "100000000000001",
                          "page_access_token": "demo-page-token", "ig_user_id": "17840000000000001"}),
    http("Read Approved rows", (440, 100), "GET", f"={{{{ {S}.sheet_url }}}}/queue?status=Approved"),
    http("Read Posted log", (660, 100), "GET", f"={{{{ {S}.sheet_url }}}}/posted"),
    node("Skip anything already posted", "code", 2, (880, 100), {"jsCode": """// One item per Approved row, flagged if its event ID is already in the Posted log
// (or appears twice in this batch), so the same event can never be posted twice.
const rows = $('Read Approved rows').first().json.rows || [];
const posted = new Set(($('Read Posted log').first().json.rows || []).map((r) => String(r.event_id)));

return rows.map((row) => {
  const id = String(row.event_id);
  const already_posted = posted.has(id);
  posted.add(id);
  return { json: { ...row, already_posted } };
});"""}),
    node("Already posted?", "if", 2.2, (1100, 100), {"conditions": {
        "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
        "conditions": [{"id": uid("if"), "leftValue": "={{ $json.already_posted }}", "rightValue": "",
                        "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
        "combinator": "and"}, "options": {}}),
    http("Mark row Already posted", (1320, -80), "POST", f"={{{{ {S}.sheet_url }}}}/queue/{{{{ $json.event_id }}}}/status",
         body='={{ JSON.stringify({ status: "Already posted" }) }}'),
    http("Publish photo post to Facebook Page", (1320, 200), "POST", f"={{{{ {S}.graph_url }}}}/{{{{ {S}.page_id }}}}/photos",
         form={"url": "={{ $json.image_url }}", "caption": "={{ $json.facebook_post }}", "access_token": f"={{{{ {S}.page_access_token }}}}"}, catch=True),
    http("Write event ID to Posted log", (1540, 100), "POST", f"={{{{ {S}.sheet_url }}}}/posted",
         body="={{ JSON.stringify({ event_id: " + ROW + ".event_id, title: " + ROW + ".title, facebook_post_id: $json.post_id, "
              "instagram_prepared: JSON.stringify({ step_1: 'POST /' + " + S + ".ig_user_id + '/media', image_url: " + ROW + ".image_url, caption: " + ROW + ".instagram_caption, "
              "step_2: 'POST /' + " + S + ".ig_user_id + '/media_publish with creation_id' }) }) }}"),
    http("Mark row Published", (1760, 100), "POST", f"={{{{ {S}.sheet_url }}}}/queue/{{{{ $json.event_id }}}}/status",
         body='={{ JSON.stringify({ status: "Published", facebook_post_id: $json.facebook_post_id }) }}'),
    http("Log failure: publishing", (1540, 320), "POST", f"={{{{ {S}.sheet_url }}}}/failures", body=fail("Publish to Facebook Page", ROW)),
    http("Mark row Failed", (1760, 320), "POST", f"={{{{ {S}.sheet_url }}}}/queue/{{{{ $json.event_id }}}}/status",
         body='={{ JSON.stringify({ status: "Failed" }) }}'),
], [
    ("Every minute", "Settings"), ("Run now", "Settings"), ("Settings", "Read Approved rows"), ("Read Approved rows", "Read Posted log"),
    ("Read Posted log", "Skip anything already posted"), ("Skip anything already posted", "Already posted?"),
    ("Already posted?", "Mark row Already posted"), ("Already posted?", "Publish photo post to Facebook Page", 1),
    ("Publish photo post to Facebook Page", "Write event ID to Posted log"), ("Write event ID to Posted log", "Mark row Published"),
    ("Publish photo post to Facebook Page", "Log failure: publishing", 1), ("Log failure: publishing", "Mark row Failed"),
])

# 3. Error workflow: anything that stops a run outright still lands in the Failures tab
workflow("errors", "Event social demo: Failure reporter", [
    note("## Demo: failure reporter\nThe other two workflows name this one as their **error workflow**. If a run stops outright "
         "(the directory is down, the sheet cannot be read), n8n starts this and it writes a line to the Failures tab.\n\n"
         "Failures on a single event (a broken photo, a refused post) are logged inside the main workflows so the other events carry on.", (-40, -300), 460, 240),
    node("When a run fails", "errorTrigger", 1, (0, 0)),
    http("Write to Failures tab", (240, 0), "POST", f"{HELPER}/sheet/failures",
         body='={{ JSON.stringify({ event: "(whole run)", step: $json.execution?.lastNodeExecuted ?? "Trigger", '
              'error: $json.execution?.error?.message ?? $json.trigger?.error?.message ?? "Unknown error", workflow: $json.workflow?.name ?? "" }) }}'),
], [("When a run fails", "Write to Failures tab")], error_workflow=False)
