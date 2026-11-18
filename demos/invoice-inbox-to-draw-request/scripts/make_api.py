"""Small Make.com API helper for the demo. Reads MAKE_API_TOKEN and MAKE_ZONE from .env; never prints the token.

    uv run python demos/invoice-inbox-to-draw-request/scripts/make_api.py whoami
    uv run python demos/invoice-inbox-to-draw-request/scripts/make_api.py connections
    uv run python demos/invoice-inbox-to-draw-request/scripts/make_api.py scenarios
    uv run python demos/invoice-inbox-to-draw-request/scripts/make_api.py blueprint <scenario id>

Read-only except `create`, which makes one inactive scenario (it never runs or schedules it).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import httpx

from agency import config

DEMO = Path(__file__).resolve().parent.parent


def api() -> httpx.Client:
    zone = config.require("MAKE_ZONE").strip().lower().removesuffix(".make.com")
    return httpx.Client(
        base_url=f"https://{zone}.make.com/api/v2",
        headers={"Authorization": f"Token {config.require('MAKE_API_TOKEN')}"},
        timeout=30,
    )


def call(c: httpx.Client, method: str, path: str, **kw) -> dict:
    r = c.request(method, path, **kw)
    if r.status_code >= 400:
        sys.exit(f"{method} {path} -> {r.status_code}: {r.text[:500]}")
    return r.json()


def teams(c: httpx.Client) -> list[dict]:
    out = []
    for org in call(c, "GET", "/organizations").get("organizations", []):
        for t in call(c, "GET", "/teams", params={"organizationId": org["id"]}).get("teams", []):
            out.append(
                {"org_id": org["id"], "org": org["name"], "team_id": t["id"], "team": t["name"]}
            )
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Make.com API helper (demo).")
    ap.add_argument("cmd", choices=["whoami", "connections", "scenarios", "blueprint", "create"])
    ap.add_argument("arg", nargs="?")
    ap.add_argument("--team", type=int, help="team id (default: the only team)")
    args = ap.parse_args()
    with api() as c:
        if args.cmd == "whoami":
            me = call(c, "GET", "/users/me").get("authUser", {})
            print(f"Token works for user {me.get('id')} ({me.get('name')})")
            for t in teams(c):
                print(
                    f"  organisation {t['org_id']} {t['org']!r} / team {t['team_id']} {t['team']!r}"
                )
            return
        team = args.team or teams(c)[0]["team_id"]
        if args.cmd == "connections":
            for k in call(c, "GET", "/connections", params={"teamId": team}).get("connections", []):
                print(f"  {k['id']:>8}  {k.get('accountName'):<22} {k.get('name')}")
        elif args.cmd == "scenarios":
            for s in call(c, "GET", "/scenarios", params={"teamId": team}).get("scenarios", []):
                print(f"  {s['id']:>8}  {s['name']}  active={s.get('isActive')}")
        elif args.cmd == "blueprint":
            bp = call(c, "GET", f"/scenarios/{args.arg}/blueprint")["response"]["blueprint"]
            out = DEMO / "make" / f"reference-blueprint-{args.arg}.json"
            out.write_text(json.dumps(bp, indent=2) + "\n")
            print(f"Saved {out}")
        elif args.cmd == "create":
            bp = json.loads(Path(args.arg).read_text())
            body = {
                "teamId": team,
                "blueprint": json.dumps(bp),
                "scheduling": json.dumps({"type": "on-demand"}),
            }
            s = call(c, "POST", "/scenarios", params={"confirmed": "true"}, json=body)["scenario"]
            print(f"Created scenario {s['id']} {s['name']!r} (inactive, on demand)")


if __name__ == "__main__":
    main()
