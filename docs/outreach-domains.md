# Outreach domains checklist (clrsweb.uk, getclrsweb.uk)

Cold email goes out from these two domains only, never from the main business domain. The CRM never sends anything: you export a list, import it into Instantly and press send there. Pricing and settings below are from memory, so check the current screens.

## 1. Mailboxes (Google Workspace)
- [ ] Sign up for Google Workspace (Business Starter) and add `clrsweb.uk` as the primary domain
- [ ] Verify the domain with the TXT record Google gives you
- [ ] Add `getclrsweb.uk` as a secondary domain and verify it the same way
- [ ] Create 2 mailboxes per domain, each with a real person's name (not `info@`)
- [ ] Turn on 2-step verification for each mailbox

## 2. DNS (for each domain)
- [ ] MX records from Google Workspace
- [ ] SPF: one TXT record, `v=spf1 include:_spf.google.com ~all` (only one SPF record per domain)
- [ ] DKIM: generate in the Google Admin console, add the TXT record, then click Start authentication
- [ ] DMARC: TXT record on `_dmarc`, start with `v=DMARC1; p=none; rua=mailto:<one of your mailboxes>`, tighten later
- [ ] Send a test email to mail-tester.com from each mailbox and aim for 9/10 or better

## 3. Make the domains look real
- [ ] Point both domains at your real website, or redirect them to it
- [ ] Use a custom tracking domain in Instantly (or turn open tracking off)

## 4. Instantly warm-up (2-3 weeks)
- [ ] Connect each mailbox to Instantly with Google sign-in
- [ ] Turn warm-up on, start at about 5 a day and ramp up
- [ ] Leave warm-up running even once real campaigns start
- [ ] Do not send real campaigns until warm-up has run for at least 2 weeks and mail-tester still passes

## 5. First campaign
- [ ] Cap each mailbox at about 30 sends a day (about 20 to start)
- [ ] Export the list from the CRM, so only companies that pass `lead_gate` are included (verified active ltd/llp/plc, not opted out, not suppressed)
- [ ] Every email carries your real name, business name and the line "Reply 'no' and I won't email again"
- [ ] Signature shows your company's registered name, number and registered office (check with your accountant)
- [ ] Check for replies and opt-outs every day
- [ ] Copy every opt-out and bounce into the CRM suppression table as soon as it arrives. Instantly has its own list and the CRM does not see it

## Rules that do not change
- Limited companies only. Sole traders and partnerships count as individuals under PECR and need consent.
- Opt-outs are permanent.
- No automatic SMS.
