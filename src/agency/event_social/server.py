"""One small local server for the demo (127.0.0.1 only). It plays four parts so the n8n workflow can run with no accounts:

  /api/v2/data_posts/get      mock directory feed, shaped like Brilliant Directories' posts API (X-Api-Key header)
  /helper/write-post, /helper/render-card   the two helper steps: Claude writes the words, Playwright draws the card
  /sheet/...                  stand-in for the Google Sheet tabs: Approval queue, Posted log, Failures
  /graph/v27.0/{page}/photos  mock of Meta's Graph API photo-post call, same parameters, replies and error shape

Nothing leaves this machine except the Claude call. Nothing is posted anywhere real.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx

from agency.event_social import posts, store

API_KEY = "demo-directory-key"       # made up: stands in for a Brilliant Directories API key
PAGE_TOKEN = "demo-page-token"       # made up: stands in for a Meta Page access token
STATUSES = {"Pending", "Approved", "Rejected", "Published", "Failed", "Already posted"}
OPTIONS = {"use_llm": True, "port": 8787}


def plain_error(text: str) -> str:
    """n8n reports a failed call as: 422 - "{\\"error\\": \\"...\\"}". Keep the words a person needs, drop the wrapping."""
    find = lambda key: re.search(key + r'[\\\\"]*\s*:\s*[\\\\"]+([^"\\\\]+)', text)
    inner = find("message") or find("error")
    return (inner.group(1) if inner else text).strip()[:600]


class Refused(Exception):
    def __init__(self, message: str, status: int = 422, body: dict | None = None):
        super().__init__(message)
        self.status, self.body = status, body or {"error": message}


def fetch_image(url: str) -> bytes:
    try:
        r = httpx.get(url, timeout=10, follow_redirects=True)
    except httpx.HTTPError as err:
        raise Refused(f"Listing photo could not be loaded ({type(err).__name__}): {url}") from err
    if r.status_code != 200 or not r.headers.get("content-type", "").startswith("image/"):
        raise Refused(f"Listing photo could not be loaded (HTTP {r.status_code}): {url}")
    return r.content


def render_card(listing: dict) -> dict:
    photo = fetch_image(listing["post_image"])
    store.DRIVE.mkdir(parents=True, exist_ok=True)
    tmp = store.OUT / f"photo-{listing['post_id']}.tmp"
    tmp.write_bytes(photo)
    out = store.DRIVE / f"event-{listing['post_id']}.jpg"
    node = shutil.which("node") or str(Path.home() / ".local/node/bin/node")
    job = {"photo_path": str(tmp), "title": listing["post_title"], "date": posts.card_date(listing["post_start_date"]),
           "location": listing["post_location"], "site": urlparse(listing["post_url"]).netloc, "out": str(out)}
    try:
        run = subprocess.run([node, str(store.DEMO / "scripts" / "render-card.mjs")], input=json.dumps(job),
                             capture_output=True, text=True, timeout=60, cwd=store.DEMO, check=False)
    finally:
        tmp.unlink(missing_ok=True)
    if run.returncode != 0:
        raise Refused(f"Image card could not be drawn: {run.stderr.strip().splitlines()[-1] if run.stderr.strip() else 'unknown error'}")
    return {**listing, "image_url": f"http://127.0.0.1:{OPTIONS['port']}/drive/{out.name}"}


def graph_error(message: str, code: int, kind: str = "OAuthException") -> Refused:
    return Refused(message, 400, {"error": {"message": message, "type": kind, "code": code, "fbtrace_id": "DEMO-MOCK"}})


def graph_photo(page_id: str, form: dict) -> dict:
    """Mock of POST /{page-id}/photos: url + caption + access_token in, {id, post_id} out, Meta's error shape on failure."""
    if form.get("access_token") != PAGE_TOKEN:
        raise graph_error("Invalid OAuth access token - Cannot parse access token", 190)
    if not form.get("url"):
        raise graph_error("(#100) Invalid parameter: url is required", 100, "GraphMethodException")
    try:
        fetch_image(form["url"])  # Meta fetches the image itself, so an unreachable one fails here too
    except Refused as err:
        raise graph_error("(#324) Missing or invalid image file", 324) from err

    def add(s: dict) -> dict:
        n = 500001 + len(s["page_posts"])
        post = {"id": str(n + 400000), "post_id": f"{page_id}_{n}", "caption": form.get("caption", ""),
                "image_url": form["url"], "created": store.now()}
        s["page_posts"].insert(0, post)
        return {"id": post["id"], "post_id": post["post_id"]}
    return store.change(add)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args) -> None:  # quiet
        pass

    def send(self, body, status: int = 200, kind: str = "application/json") -> None:
        data = body if isinstance(body, bytes) else (body if isinstance(body, str) else json.dumps(body)).encode()
        self.send_response(status)
        self.send_header("Content-Type", kind + ("; charset=utf-8" if kind.startswith("text") or "json" in kind else ""))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def body(self) -> dict:
        raw = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode()
        if "json" in (self.headers.get("Content-Type") or ""):
            return json.loads(raw or "{}")
        return {k: v[0] for k, v in parse_qs(raw).items()}

    def file(self, folder: Path, name: str) -> None:
        path = folder / Path(name).name
        if not path.is_file():
            return self.send({"error": "not found"}, 404)
        self.send(path.read_bytes(), kind="image/jpeg")

    def handle_any(self, method: str) -> None:
        url = urlparse(self.path)
        path, query = url.path.rstrip("/") or "/", {k: v[0] for k, v in parse_qs(url.query).items()}
        try:
            self.route(method, path, query)
        except Refused as err:
            self.send(err.body, err.status)
        except Exception as err:  # noqa: BLE001  a helper bug should reach the Failures tab as words, not a dropped connection
            self.send({"error": f"{type(err).__name__}: {err}"}, 500)

    def do_GET(self) -> None:
        self.handle_any("GET")

    def do_POST(self) -> None:
        self.handle_any("POST")

    def route(self, method: str, path: str, query: dict) -> None:
        if method == "GET":
            if path == "/":
                return self.send((Path(__file__).parent / "board.html").read_text(), kind="text/html")
            if path == "/state":
                return self.send({**store.load(), "listings": store.listings(), "ai": OPTIONS["use_llm"]})
            if path.startswith("/photos/"):
                return self.file(store.DEMO / "sample-data" / "photos", path)
            if path.startswith("/drive/"):
                return self.file(store.DRIVE, path)
            if path == "/api/v2/data_posts/get":
                if self.headers.get("X-Api-Key") != API_KEY:
                    return self.send({"status": "error", "message": "Invalid API key"}, 401)
                rows = store.listings()
                if "property" in query:  # Brilliant Directories' filter: property + property_value
                    rows = [r for r in rows if str(r.get(query["property"])) == query.get("property_value")]
                return self.send({"status": "success", "total": len(rows), "current_page": 1, "total_pages": 1,
                                  "next_page": "", "prev_page": "", "message": rows})
            if path in ("/sheet/queue", "/sheet/posted", "/sheet/failures"):
                rows = store.load()[path.split("/")[-1]]
                if "status" in query:
                    rows = [r for r in rows if r.get("status") == query["status"]]
                return self.send({"rows": rows})
        if method == "POST":
            data = self.body()
            if path == "/helper/write-post":
                return self.send({**data, **posts.write(data, use_llm=OPTIONS["use_llm"])})
            if path == "/helper/render-card":
                return self.send(render_card(data))
            if path == "/sheet/queue":
                row = {k: data.get(k, "") for k in ("event_id", "title", "event_date", "facebook_post", "instagram_caption",
                                                    "image_url", "link", "written_by")}
                row |= {"status": "Pending", "added": store.now(), "updated": "", "facebook_post_id": ""}
                return self.send(store.change(lambda s: s["queue"].append(row) or row))
            if m := re.fullmatch(r"/sheet/queue/(\d+)/status", path):
                if data.get("status") not in STATUSES:
                    raise Refused(f"Unknown status: {data.get('status')}")

                def update(s: dict) -> dict:
                    rows = [r for r in s["queue"] if str(r["event_id"]) == m.group(1)]
                    for r in rows:
                        r |= {"status": data["status"], "updated": store.now()}
                        if data.get("facebook_post_id"):
                            r["facebook_post_id"] = data["facebook_post_id"]
                    return {"updated": len(rows)}
                return self.send(store.change(update))
            if path == "/sheet/posted":
                row = {"event_id": data.get("event_id"), "title": data.get("title", ""), "facebook_post_id": data.get("facebook_post_id", ""),
                       "instagram_prepared": data.get("instagram_prepared", ""), "posted": store.now()}
                return self.send(store.change(lambda s: s["posted"].append(row) or row))
            if path == "/sheet/failures":
                row = {"when": store.now(), "event_id": data.get("event_id", ""), "event": data.get("event", ""),
                       "step": data.get("step", ""), "error": plain_error(str(data.get("error", ""))), "workflow": data.get("workflow", "")}
                return self.send(store.change(lambda s: s["failures"].insert(0, row) or row))
            if m := re.fullmatch(r"/directory/(\d+)/publish", path):  # the board's "goes live" switch, not part of any real API
                return self.send(store.change(lambda s: s["went_live"].append(int(m.group(1))) or {"ok": True}))
            if m := re.fullmatch(r"/graph/v[\d.]+/(\d+)/photos", path):
                return self.send(graph_photo(m.group(1), data))
        self.send({"error": f"No such route: {method} {path}"}, 404)


def serve(port: int, use_llm: bool) -> None:
    OPTIONS.update(use_llm=use_llm, port=port)
    store.DRIVE.mkdir(parents=True, exist_ok=True)
    print(f"Demo board: http://127.0.0.1:{port}  (posts written by {'Claude Haiku, cached' if use_llm else 'rules, no AI'}). Ctrl+C stops it.")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
