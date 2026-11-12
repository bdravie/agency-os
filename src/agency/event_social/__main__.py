"""Usage:
  uv run python -m agency.event_social serve     start the demo helper and board on http://127.0.0.1:8787
  uv run python -m agency.event_social reset     empty the queue, Posted log, Failures and mock Page (start of a Loom take)

The n8n workflows in demos/event-listing-to-social-post-queue/n8n/ do the work; this only serves the local stand-ins.
Nothing is posted anywhere real.
"""

from __future__ import annotations

import argparse

from agency.event_social import server, store


def main() -> None:
    p = argparse.ArgumentParser(description="Demo helper: event listing to social post queue.")
    sub = p.add_subparsers(dest="command", required=True)
    s = sub.add_parser("serve", help="Run the mock directory, sheet stand-in, helper steps and mock Graph API")
    s.add_argument("--port", type=int, default=8787)
    s.add_argument("--no-llm", action="store_true", help="Rule-based post wording: free and offline")
    sub.add_parser("reset", help="Empty the demo's queue, logs and image folder")
    args = p.parse_args()
    if args.command == "reset":
        store.reset()
        print(f"Demo reset: {store.OUT}")
    else:
        server.serve(args.port, use_llm=not args.no_llm)


if __name__ == "__main__":
    main()
