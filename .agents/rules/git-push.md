# Git: commit and push every change

The owner wants every update pushed to https://github.com/bdravie/agency-os (branch `main`).

System git is NOT installed (no disk space for Xcode tools). Use the pure-JS tool instead:

- After finishing any change (code, config, docs, migrations), run from the repo root:
  `node tools/git/sync.mjs "<short, clear message>"`
- Check what would be committed: `node tools/git/sync.mjs --status`
- If `tools/git/node_modules` is missing: `npm install --prefix tools/git`
- Use small, descriptive commit messages (e.g. `M1: CRM deals kanban`).
- Never commit `.env` or any secret; the tool blocks `.env` and respects `.gitignore`.
- Never force-push or rewrite history; ask the owner instead.
- If a push fails (no network, missing/expired GITHUB_TOKEN), say so clearly and tell the owner how to fix it.
- Also follow the rules in `CLAUDE.md` (stack, business rules, conventions).
