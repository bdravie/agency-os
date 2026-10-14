---
description: Draft an Upwork proposal from a pasted job post
---

Draft an Upwork proposal for this job post:

$ARGUMENTS

1. Save the job post text to a scratch file, then run `uv run python -m agency.proposal <file> --title "<job title>" --url "<job url if given>"`.
2. It scores fit with Haiku (skips below 6 unless `--force`), drafts under 145 words with Sonnet, and saves to the proposals table as Draft.
3. Show me the fit score and the draft, and say it is saved in the CRM under Proposals.
4. Never mention a project that is not in `portfolio/portfolio.md`.
