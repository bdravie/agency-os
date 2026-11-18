# Loom script: invoice inbox to draw request (2 minutes)

Have open before recording, one browser window, tabs in this order:
1. **Gmail** (business account): three drafts to the demo alias, ready to send, with the PDFs from `sample-data/pdfs/` attached in number order: 01-04, 05-08, 09-12. Order matters: the later copy is the one flagged Duplicate, so send them in that order. No other mail on screen (open the `invoices-demo` label, which is empty).
2. **Make**: the scenario `Invoice inbox to draw request (demo)`, zoomed to fit all 8 modules.
3. **Drive**: `Invoices (demo)`, showing the four empty folders.
4. **The tracker sheet** on the Tracker tab, empty below the header.

Before each take (the first take after a full test run): delete the Tracker rows below the header, delete every `Draw ...` tab, empty the four Drive folders (and the Drive bin), and delete the previous test emails from `invoices-demo` so only the new ones show. Close other tabs, turn on Do Not Disturb, and hide the bookmarks bar.

**The problem (0:00-0:15)**
"Every invoice that comes in by email gets saved, typed into the tracker by hand, and checked against what's already been paid. Then once a month someone builds the draw request and has to make sure nothing goes in twice. This is a demo with made-up suppliers and projects, so you can see the whole flow."

**The trigger (0:15-0:30)**
- In Gmail, send the 3 drafts (4 PDFs each) to the demo address. They land under the `invoices-demo` label.
- "Invoices arrive like this, as PDF attachments."

**The automation running (0:30-1:30)**
- Switch to Make, press **Run once**. "Make takes each PDF, Claude reads the vendor, invoice number, date, amount and project, and it's filed in that project's folder."
- Open Drive > `MILL - Millbrook Barn`: the PDFs are there with tidy names. Open `_Needs review`: "this one is for a project we don't have, so it's held back."
- Switch to the sheet. The rows are there. Point at:
  - the **Duplicate** row for BW-1182: "the supplier sent the same invoice again; it says which row it matches";
  - the **Duplicate** for Corrowstone: "re-issued with a new number but the same amount, so it's caught too";
  - the **Review** rows: "no invoice number on this one, and an unknown project on this one, with the reason in Notes."
- "Your admin approves the Ready rows." Click **Invoices (demo) > Demo: approve all Ready rows** (say it stands in for approving by hand).

**The result (1:30-1:50)**
- **Invoices (demo) > Generate draw...**, project `MILL`, month `2026-10`. The new tab `Draw MILL-D01` opens: two invoices and a total worked out in code. Show the Tracker's Draw no column now says MILL-D01, and the `Draw exceptions` tab listing the duplicate and the review row with reasons.
- Run **Generate draw...** again with the same answers: "Nothing to draw. Anything already in a draw is never counted twice."

**The offer (1:50-2:00)**
"This is a demo on made-up invoices. I'd build it on your own tracker and draw template, starting with a batch of your sample invoices so we can check every field before it touches your live inbox."

## If Google and Make are not set up yet (local version)

Same story from the terminal and Finder:
1. `run_local.py reset` then `run_local.py inbox`: read the printed lines aloud (folder, fields, status), then open `output/invoice-draw/drive/` in Finder.
2. Open `output/invoice-draw/Tracker.csv` in Numbers: point at the two Duplicate and two Review rows.
3. `run_local.py approve`, then `run_local.py draw --project MILL --month 2026-10` twice: open `Draw MILL-D01.csv` and `Draw exceptions.csv`.
