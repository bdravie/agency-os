# Knowledge base

What the assistant knows. The assistant is on the Assistant page (`/assistant`, in the sidebar under Home). It answers from the files listed in `config/knowledge.yaml` and cites the passage it used, so it can only be as good as what is written here.

## How to teach it something

1. Write it down in plain Markdown, in the topic folder it belongs to:
   - `knowledge/crm/` for how the CRM works and where things live
   - `knowledge/research/` for research methods and what you have learned about niches
   - `knowledge/design/` for design techniques you want to reuse
   - `knowledge/contracts/` for which agreements you send and what goes in them
2. Use a `#` or `##` heading for each idea. The assistant reads whole sections, so a clear heading and one idea per section match questions best.
3. Save. Files are read again when they change; nothing needs restarting.

To use a file that lives somewhere else in the repo, add its path under the right topic in `config/knowledge.yaml`.

## Rules for what goes in

- Business knowledge only. No client's customers or patients, no personal email addresses or phone numbers.
- Write facts you have checked. The assistant repeats what is here, and marks anything it says from general knowledge as such.
- Contract notes are not legal advice. Have a solicitor check a template once; then record here what they said.
