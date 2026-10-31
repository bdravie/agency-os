# Hand-off, second session of 31 Oct 2026

Read `CLAUDE.md` first, then `docs/handoff-2026-10-31.md` (Mac setup, earlier build), then this. The owner is not a developer: explain in one or two sentences before acting, plain English, UK spelling.

## What was built this session (all committed and pushed)

1. **Offers catalogue, packages and Deal builder** (commit 631665a, fix da60440)
   - `config/offers.yaml` now has agency services with researched London default prices (website, hosting, SEO audit and retainer, ad setup, PPC, social, AI chatbot build and hosting) and packages (Website, SEO, Website and SEO launch, Paid ads, AI chatbot, AI automation) that list the services they need.
   - Seeded insert-only by `crm/scripts/seedOffers.mts` (run with tsx from `crm/`, `--env-file=../.env`).
   - Company page (new deal) and deal page (add lines): Deal builder lets the owner pick packages, single services or custom services, edit every price and day count, then Confirm. Nothing is saved before Confirm. Deal values always come from the lines. Code: `crm/lib/dealBuilder.ts`, `dealBuilderData.ts`, `offerActions.ts` (`confirmDeal`), `components/DealBuilder.tsx`.
   - Gotcha already fixed: Postgres bigint ids arrive as strings, so convert with `Number()`.
   - Price caveat told to the owner: the research is indicative (agency blogs, no revenue filter); chatbot monthly £400 is an estimate.

2. **Click-to-send email and reply Inbox** (commit 7206628)
   - Migration `20261103100000_mailboxes_sending_and_replies.sql` (applied): `mailboxes`, `sent_emails`, `email_replies`.
   - Pages: `/mailboxes` (connect Google accounts, daily cap), `/inbox` (filter All or one mailbox, unread/all, auto-replies toggle, reading view). Send button and mailbox picker on the Outreach draft (`OutreachDraft.tsx`, `lib/sendActions.ts`).
   - Rules: owner's click only, one email at a time, `lead_gate`, `contact_gate`, suppression, opt-out line and names required, no placeholders, one first email plus one follow-up per address, per-mailbox daily cap (default 10), DB trigger as backstop. Replies are read only in threads the CRM sent. Opt-out replies are flagged, recorded only by click. Bounces and unsubscribes stay on Instantly (copy to suppression by hand).
   - Notifications: unread badge in the sidebar, toasts and browser desktop notifications via a 60-second poll while a CRM tab is open. Optional background Mac notifier `scripts/com.agencyos.replies.plist` plus `crm/scripts/checkReplies.mts`: **not installed**.
   - Tokens are stored encrypted with a key derived from `SESSION_SECRET`: changing it means reconnecting mailboxes.
   - `CLAUDE.md` was updated with the click-to-send exception and two new rules bullets. `docs/SETUP.md` section 2b has the Google Cloud steps.

## Where we stopped: connecting the first mailbox

The owner is mid-way through connecting `clrsweb.uk` on `/mailboxes`. Google's consent step worked (all five scopes granted, account chosen). Problems met and what they meant:

- `Error 403 access_denied` from Google: app was in Testing mode and the account was not a test user. Told the owner to add each mailbox under Test users (or Publish app; Internal only works if the project sits in their Workspace org).
- `{"error":"Unauthorised"}` and a Google `401 malformed` page: browser logins are separate for `localhost` and `127.0.0.1`.
- Final cause found: `.env` has `GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback`, but the running CRM was still using the default `127.0.0.1` redirect because it had not been restarted. The callback landed on `127.0.0.1` with no login cookie and the middleware returned 401.
- **Fix applied:** restarted the service (`launchctl kickstart -k gui/$(id -u)/com.agencyos.crm`, login page returned 200). The owner was told to open `http://localhost:3000/mailboxes` (not 127.0.0.1), log in there, click Connect, pick `clrsweb.uk`, click through the "unverified" warning.
- **Not yet confirmed that it worked.** First thing to do: ask whether the mailbox now shows as connected on `/mailboxes`. If not, ask for the address in the address bar (hide `client_id`) and any message shown.
- The Google Cloud OAuth client must list `http://localhost:3000/api/google/callback` under Authorised redirect URIs (the owner was told; not confirmed).
- I confirmed (without printing values) that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` have the right shape and that Google accepts the CRM's sign-in URL.
- A one-time Google auth code was pasted into chat by the owner. It is already spent and harmless.

## Not verified yet

Real Google sending, reply fetching, the OAuth callback end to end, MIME acceptance by Gmail, and a logged-in click-through of the Deal builder, Send button and Inbox. Suggested first send: to the owner's own address, then reply, to prove the whole chain.

## Owner actions outstanding

- Finish connecting the first mailbox (above), then the second Workspace mailbox once Google Workspace support replies (they said within one working day of the earlier message).
- Decide Testing vs Publish app on the Google consent screen (Testing drops tokens every 7 days).
- Raise each mailbox's daily cap as Instantly warm-up proceeds (starts at 10). Instantly stays for warm-up only.
- Decide whether to install the background notifier plist.
- Older items from `docs/handoff-2026-10-31.md` remain: click-through of yesterday's features, rapport research on a real person, review niche email copy, `SEARCH_API_KEY` status, Log activity form, content ideas cleanup, hosting, `outreach-email.md`.

## Working notes for the next session

- The guard-bash hook blocks Bash commands that read or print `.env` and destructive DB commands. Do not work around it. To check env values safely, run a scratchpad `.mts` with `npx tsx --env-file=../.env` that prints only booleans or non-secret values.
- Run tests with `npm test` in `crm/` (238 passing at last run); `tsc` clean.
- Commit only with `node tools/git/sync.mjs "message"`, ending the message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Restart the CRM after any `.env` change: `launchctl kickstart -k gui/$(id -u)/com.agencyos.crm` (production build, so rebuild with `npm run build` in `crm/` after code changes).
- `CLAUDE.md` says the click-to-send approval was on 2 Nov 2026 while the Mac clock said 31 Oct 2026; harmless, but worth a tidy if the owner cares.
