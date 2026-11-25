# Loom script: consent-first lead capture and journey tracker (2 minutes)

**Set up before recording** (README, steps 1 to 8):
- n8n is running and the workflow is published. Reconnect the Google credential if it is more than 6 days old.
- The sample data is loaded: `node demos/consent-first-lead-capture-and-journey-t/scripts/load-sample.mjs`.
- `node demos/consent-first-lead-capture-and-journey-t/scripts/local.mjs serve` is running so the pages are served.
- Three browser tabs, in this order:
  1. **Website:** `http://127.0.0.1:5690/?hook=http://localhost:5678/webhook/lead-capture`
  2. **Team view:** the *Open the team view* link, with `&sheet=<ID>` added to its address.
  3. **The Google Sheet**, on the *Contacts* tab, scrolled to the bottom row.

## The problem (15s)
*Website tab.*
"This is a small partnerships consultancy. People find them three ways: the website, the newsletter and LinkedIn. Right now those are three separate lists, nobody knows who agreed to what, and nobody can see who's actually ready for a conversation."

## The trigger (15s)
*Fill in the newsletter form: Imogen, Harbourline Trust, `Imogen.Thackeray@Example.com`. Tick the box, then click **Subscribe**.*
"So Imogen signs up for the newsletter on the website. She's also filled in a LinkedIn form, so her lead comes in from LinkedIn's export too."
*Team view tab: click **Use the Loom row**. The log says "1 merged into an existing contact".*

## The automation running (60s)
*Sheet tab, Contacts: Imogen's row.*
"One row, not two, even though she typed her email differently each time. Both sources are on it, and so is the exact wording she agreed to, the date and the lawful basis. Her newsletter is *pending*, because she hasn't confirmed yet."
*Click the **Consent log** tab.* "Every capture is logged separately, so there's evidence for each one."

*Website tab: click **Open the confirmation link**, then **Yes, subscribe me**.*
"In real life that link arrives by email. Nothing is sent in this demo. She confirms..."
*Team view tab: Imogen's card moves from Discovered to Identified, outlined in gold (click Refresh if you don't want to wait).*
"...and she moves along the journey: from Discovered to Identified, because now we know who she is, where she works and that she wants to hear from us. The four stages are plain rules anyone can read and change."

*Team view: under **Unsubscribe request**, type `sofia.marin@example.net` and click **Add to suppression list**. Her card is struck through.*
"Sofia's replied asking to be removed. She goes on the suppression list for good, so no import can add her back."
*Click **Draft follow-ups**.*
"Now the Opportunity column. These people asked us something. Claude drafts a short personal note to each one, for a person to read before anything goes. Look at what it skipped: Sofia, because she opted out, and Amara, because she only agreed to the newsletter, not to sales emails."
*Sheet tab: click **Follow-up drafts**. Open one draft.*

## The result (20s)
"So instead of three lists and guesswork, there's one list with consent you can prove, a clear view of who's ready for a conversation, and opt-outs that are respected everywhere, automatically. It runs on a Google Sheet and a few pounds of hosting, which is plenty for a new business."

## The offer (10s)
"If this is the kind of setup you need, I'd start by mapping your journey with you, then build the smallest version that works on your own website and newsletter, and tell you honestly when it's worth moving to a proper CRM."
