# Plan: the CRM on clrsweb.uk (staff backend), public website later

Status: plan only, nothing built or changed yet. Decisions are marked **Decide**.

## Goal
- `crm.clrsweb.uk`: the CRM, for the owner only, reachable from any device.
- `clrsweb.uk` (the bare domain): left free for the public website, designed later. Until then it redirects or shows a simple holding page, which the outreach checklist needs anyway.
- Email on `clrsweb.uk` keeps working throughout. Cold email deliverability comes first.

## Recommended approach: the app stays on the laptop, Cloudflare Tunnel plus Cloudflare Access in front
- Nothing to deploy or pay for. The CRM reads files from the repo (prompts, config, portfolio), so moving it to a host means rebuilding that. The tunnel avoids it.
- Cloudflare Access (free for up to 50 users) puts a sign-in in front of the whole site: only the owner's email can even reach the login page. The CRM's own password stays as the second layer.
- Cost: £0 beyond the domain. Limitation: the laptop must be on and the tunnel running, and the CRM is down when it sleeps.
- **Decide:** if "always on" matters, the alternative is a small always-on host (for example a £4-5/month VPS running the same app and tunnel). Start with the laptop, move later if it hurts.

## Steps

### 1. Move DNS for clrsweb.uk to Cloudflare (careful: this carries the email)
- [ ] Add `clrsweb.uk` to a free Cloudflare account. Cloudflare scans the existing records.
- [ ] Before changing nameservers, check every email record was copied: MX (Google), SPF, DKIM, DMARC, and the Workspace verification TXT. Add any that are missing by hand.
- [ ] Set every mail record to **DNS only** (grey cloud), never proxied.
- [ ] Switch the nameservers at the registrar, wait for Cloudflare to say active, then send a test email from the mailbox and check mail-tester.com still passes.
- [ ] Pause warm-up in Instantly for that mailbox only while nameservers change (usually under an hour), then resume.
- Leave `getclrsweb.uk` where it is. It does not need to move.

### 2. Tunnel
- [ ] Zero Trust, Networks, Tunnels: create a tunnel (the setup guide already mentions `CLOUDFLARE_TUNNEL_TOKEN`).
- [ ] Public hostname `crm.clrsweb.uk` pointing at `http://localhost:3000`.
- [ ] Run `cloudflared` as a background service on the Mac (launchd) so it restarts with the laptop.
- [ ] Run the CRM with `npm run build && npm run start` (not `dev`) so it is fast and sets the secure cookie.

### 3. Lock it down
- [ ] Cloudflare Access application for `crm.clrsweb.uk`: policy allows only the owner's email, one-time PIN by email.
- [ ] Webhooks stay reachable: add an Access bypass for the path `/api/webhooks/*` only. Those routes already verify their own signature or secret.
- [ ] Set a long, unique `APP_PASSWORD` and a 32+ character `SESSION_SECRET`.
- [ ] Add login rate limiting in the app (one failed-attempt counter) before this goes public.
- [ ] Confirm `DEMO_MODE` is off and no page works without login (walk through every top-level page signed out).
- [ ] Add `crm.clrsweb.uk` to the checks in the backup doc so a restore test covers the hosted setup.

### 4. Holding page for `clrsweb.uk`
- [ ] A one-page placeholder (business name, one line, contact email) or a redirect to wherever you want cold-email recipients to land. Static, on Cloudflare Pages (free).
- Later: the proper front-facing site replaces this page. **Decide** its stack and design then.

## Changes to the project's rules (not made yet)
[CLAUDE.md](../CLAUDE.md) currently says the CRM listens on 127.0.0.1 only and the tunnel exposes only `/api/webhooks/*`. This plan exposes the whole app behind Cloudflare Access instead. Once you approve, I will update that paragraph, the stack notes and `docs/SETUP.md` so they match.

## Risks
- **Email:** the DNS move is the one step that can break mail. Do it in a quiet hour, not mid-campaign.
- **Cold-email reputation:** the backend sits on a subdomain, not the bare domain, so a login page does not mix with the domain people see in your emails. Keep it that way.
- **Exposure:** the CRM holds lead and business data. The two sign-in layers, no demo mode and rate limiting are the minimum before opening it up.
- **Laptop sleep:** reminders and any scheduled jobs stop with it.

## Suggested order
1. Finish the mailbox and Instantly warm-up (this week, not touched by hosting).
2. Holding page and DNS move (one sitting).
3. Tunnel and Access (one sitting, an hour).
4. Hardening checklist, then use it from your phone.
5. Public website design (separate project).
