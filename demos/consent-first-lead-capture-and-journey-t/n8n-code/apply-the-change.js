// Runs after "Read the sheet". Works out what this request changes in the four tabs and how to answer it.
// Requests: signup (website forms), confirm / confirmed (the link in the sign-up email), unsubscribe / unsubscribed,
// and team (LinkedIn import, click report, unsubscribe on request, draft follow-ups, view). Nothing is ever sent.
const s = $('Settings').first().json;
const tabs = readTabs($input.first().json);
const at = nowStamp();
const body = s.body || {};
const query = s.query || {};
// Which webhook fired: the last part of its address, or (if n8n leaves webhookUrl out) whichever webhook node ran.
const HOOKS = { 'Website forms': 'signup', 'Confirm link': 'confirm', 'Confirm button': 'confirmed', 'Unsubscribe link': 'unsubscribe', 'Unsubscribe button': 'unsubscribed', 'Team view': 'team' };
const ranHook = () => Object.entries(HOOKS).find(([n]) => { try { return $(n).isExecuted; } catch (e) { return false; } })?.[1];
const fromUrl = String(s.webhookUrl || '').split('?')[0].split('/').filter(Boolean).pop();
const action = Object.values(HOOKS).includes(fromUrl) ? fromUrl : (ranHook() || '');
const changed = new Set();
const base = String(s.public_base_url).replace(/\/+$/, '');

const json = (data) => ({ response_type: 'application/json', response_body: JSON.stringify(data) });
const html = (title, inner) => ({ response_type: 'text/html; charset=utf-8', response_body: page(s, title, inner) });
const done = (reply, extra = {}) => [{ json: { action, tabs, save: changed.size > 0, write: writeBody(tabs, [...changed]), ai: [], ...reply, ...extra } }];

const suppressed = (key) => tabs.suppression.rows.some((r) => r.match_key === key);
const findBy = (field, value) => value ? tabs.contacts.rows.find((c) => c[field] === value) : undefined;
const log = (key, event, source, form_version, wording, lawful_basis, evidence) => {
  tabs.consent.rows.push({ logged_at: at, match_key: key, event, source, form_version, wording, lawful_basis, evidence });
  changed.add('consent');
};
// Why the business may contact this person, worked out from what they have done.
const basisOf = (c) => {
  const parts = [];
  if (['pending', 'confirmed'].includes(c.newsletter)) parts.push(c.newsletter === 'confirmed' ? 'Consent (newsletter, confirmed)' : 'Consent (newsletter, waiting for confirmation)');
  if (num(c.enquiries) > 0) parts.push('Legitimate interests (replying to their enquiry)');
  if (c.sources.includes('LinkedIn')) parts.push('Legitimate interests (following up their LinkedIn form)');
  if (c.newsletter === 'unsubscribed') parts.unshift('Unsubscribed: do not contact');
  return parts.join('; ') || 'None recorded';
};

// Add one person, or merge them into the row that already has their address. Returns what happened.
const upsert = (input) => {
  const email = cleanEmail(input.email);
  if (!email) return { result: 'skipped', why: 'not a usable email address' };
  const key = matchKey(email);
  if (suppressed(key)) return { result: 'skipped', key, why: 'on the suppression list, so not added back' };
  let c = findBy('match_key', key);
  const isNew = !c;
  if (isNew) {
    c = Object.fromEntries(TABS.contacts.cols.map((col) => [col, '']));
    Object.assign(c, { match_key: key, email, first_seen: at, clicks: '0', enquiries: '0', newsletter: 'none', unsubscribe_token: token() });
    tabs.contacts.rows.push(c);
  }
  // Fill gaps only: a later source never overwrites what someone told us first.
  for (const [col, val] of [['first_name', nameCase(input.first_name)], ['last_name', nameCase(input.last_name)], ['organisation', tidy(input.organisation, 80)], ['job_title', tidy(input.job_title, 80)]]) {
    if (!c[col] && val) c[col] = val;
  }
  const sources = c.sources ? c.sources.split(', ') : [];
  if (!sources.includes(input.source)) sources.push(input.source);
  c.sources = sources.join(', ');
  if (input.enquiry) { c.enquiries = String(num(c.enquiries) + 1); c.last_enquiry = mask(tidy(input.enquiry, 500)); }
  let link = '';
  // A newsletter tick starts (or keeps) one pending confirmation. A second tick from another source is logged, but the
  // link already sent stays the one that confirms, so nobody is left holding a dead link.
  if (input.newsletter && c.newsletter !== 'confirmed') {
    if (c.newsletter !== 'pending' || !c.confirm_token || expired(c)) {
      c.newsletter = 'pending';
      c.consent_wording = input.wording; c.consent_source = input.source; c.consent_date = at;
      c.confirm_token = token();
    }
    link = `${base}/confirm?t=${c.confirm_token}`;
  }
  c.lawful_basis = basisOf(c);
  c.last_updated = at;
  restage(c, s, at);
  changed.add('contacts');
  log(key, input.event, input.source, input.form_version, input.wording, c.lawful_basis, input.evidence);
  return { result: isNew ? 'added' : 'merged', key, contact: c, link, as_typed: tidy(input.email, 120) };
};

const unsubscribe = (c, how, reason) => {
  if (!suppressed(c.match_key)) {
    tabs.suppression.rows.push({ added_at: at, match_key: c.match_key, email: c.email, reason, how });
    changed.add('suppression');
  }
  c.newsletter = 'unsubscribed'; c.confirm_token = ''; c.last_updated = at;
  c.lawful_basis = basisOf(c);
  restage(c, s, at);
  changed.add('contacts');
  for (const d of tabs.drafts.rows) if (d.match_key === c.match_key && d.status === 'To review') { d.status = 'Withdrawn: unsubscribed'; changed.add('drafts'); }
  log(c.match_key, 'Unsubscribed', how, '', reason, 'Opt-out recorded; kept on the suppression list', how === 'Unsubscribe link' ? 'Unsubscribe link used' : 'Recorded by the team');
};

const expired = (c) => {
  const sent = Date.parse(String(c.consent_date).replace(' ', 'T'));
  return Number.isFinite(sent) && Date.now() - sent > num(s.confirm_days) * 24 * 3600 * 1000;
};

// ---------- Public: the website's two forms ----------
if (action === 'signup') {
  if (body.website) return done(json({ ok: true, message: 'Thanks.' }));          // the hidden field only bots fill in
  const form = body.form === 'enquiry' ? 'enquiry' : 'newsletter';
  const wantsNewsletter = form === 'newsletter' ? body.consent === 'yes' : body.newsletter === 'yes';
  if (!cleanEmail(body.email)) return done(json({ ok: false, field: 'email', message: 'Enter an email address, like name@example.com.' }));
  if (form === 'newsletter' && !wantsNewsletter) return done(json({ ok: false, field: 'consent', message: 'Tick the box to say you want the newsletter.' }));
  if (form === 'enquiry' && tidy(body.message, 500).length < 10) return done(json({ ok: false, field: 'message', message: 'Tell us a little about what you have in mind.' }));
  const wording = form === 'newsletter' ? s.newsletter_wording : [s.enquiry_wording, wantsNewsletter ? s.newsletter_wording : ''].filter(Boolean).join(' ');
  const r = upsert({
    email: body.email, first_name: body.first_name, last_name: body.last_name, organisation: body.organisation,
    source: form === 'newsletter' ? 'Website newsletter' : 'Website enquiry',
    newsletter: wantsNewsletter, enquiry: form === 'enquiry' ? body.message : '',
    event: form === 'newsletter' ? 'Newsletter sign-up (waiting for confirmation)' : (wantsNewsletter ? 'Enquiry, with newsletter sign-up' : 'Enquiry'),
    form_version: form === 'newsletter' ? s.newsletter_form_version : s.enquiry_form_version, wording,
    evidence: 'Website form submitted',
  });
  const message = form === 'newsletter' ? 'Check your inbox and click the link to confirm. Until you do, you won\'t get the letter.' : 'Thanks, we have your message and will reply personally.';
  const demo = s.show_confirm_link_on_page === 'yes' && r.link ? { demo_confirm_link: r.link } : {};
  return done(json({ ok: true, message, ...demo }));   // the same answer whether or not the address was known or suppressed
}

// ---------- Public: the confirm link (GET shows a button, POST confirms, so a mail scanner opening the link changes nothing) ----------
if (action === 'confirm' || action === 'confirmed') {
  const t = tidy(action === 'confirm' ? query.t : body.t, 40);
  const c = findBy('confirm_token', t);
  if (!c || c.newsletter !== 'pending') return done(html('Link already used', `<h1>This link has already been used</h1><p>If you meant to sign up, you are either confirmed already or the link has expired. You can sign up again on our website.</p>`));
  if (expired(c)) return done(html('Link expired', `<h1>This link has expired</h1><p>Confirmation links last ${esc(s.confirm_days)} days. Sign up again on our website and we'll send a fresh one.</p>`));
  if (action === 'confirm') {
    return done(html('Confirm your subscription', `<h1>Confirm your subscription</h1><p>Press the button to start receiving the ${esc(s.business_name)} newsletter. You can unsubscribe at any time from any issue.</p><form method="post" action="${esc(base)}/confirmed"><input type="hidden" name="t" value="${esc(t)}"><button type="submit">Yes, subscribe me</button></form>`));
  }
  c.newsletter = 'confirmed'; c.confirmed_date = at; c.confirm_token = ''; c.last_updated = at;
  c.lawful_basis = basisOf(c);
  const before = c.stage;
  restage(c, s, at);
  changed.add('contacts');
  log(c.match_key, 'Newsletter confirmed', c.consent_source, '', c.consent_wording, c.lawful_basis, 'Confirm link used, then the confirm button pressed');
  const unsub = `${base}/unsubscribe?t=${c.unsubscribe_token}`;
  return done(html('Subscribed', `<h1>You're subscribed</h1><p>Thank you. Every issue has an unsubscribe link, and this one works too: <a href="${esc(unsub)}">unsubscribe</a>.</p>`), { stage_change: { from: before, to: c.stage } });
}

// ---------- Public: the unsubscribe link ----------
if (action === 'unsubscribe' || action === 'unsubscribed') {
  const t = tidy(action === 'unsubscribe' ? query.t : body.t, 40);
  const c = findBy('unsubscribe_token', t);
  if (!c) return done(html('Link not recognised', `<h1>We couldn't find that link</h1><p>Reply to any email from us with "unsubscribe" and we'll take you off the list by hand.</p>`));
  if (action === 'unsubscribe') {
    if (suppressed(c.match_key)) return done(html('Already unsubscribed', `<h1>You're already unsubscribed</h1><p>We won't email you again.</p>`));
    return done(html('Unsubscribe', `<h1>Unsubscribe?</h1><p>Press the button and we won't email you again, newsletter or otherwise.</p><form method="post" action="${esc(base)}/unsubscribed"><input type="hidden" name="t" value="${esc(t)}"><button type="submit">Unsubscribe me</button></form>`));
  }
  unsubscribe(c, 'Unsubscribe link', 'Asked to stop all emails');
  return done(html('Unsubscribed', `<h1>You're unsubscribed</h1><p>We've added your address to our do-not-contact list, so you won't hear from us again.</p>`));
}

// ---------- Team view (in a real build this sits behind a login) ----------
if (action === 'team') {
  if (!s.team_key || body.key !== s.team_key) return done(json({ ok: false, error: 'Wrong team key. It is in the Settings node.' }));
  const what = body.action;

  if (what === 'linkedin') {
    const rows = parseCsv(body.csv);
    const report = [];
    for (const row of rows) {
      const consentCol = Object.keys(row).find((h) => /consent|newsletter|marketing/.test(h));
      const ticked = consentCol ? /^(yes|true|checked|1|y)$/i.test(row[consentCol]) : false;
      const r = upsert({
        email: pick(row, 'email address', 'email', 'work email', 'e-mail'),
        first_name: pick(row, 'first name', 'first_name', 'firstname'), last_name: pick(row, 'last name', 'last_name', 'lastname'),
        organisation: pick(row, 'company name', 'company', 'organisation', 'organization'), job_title: pick(row, 'job title', 'title', 'job_title'),
        source: 'LinkedIn lead form', newsletter: ticked,
        event: ticked ? 'LinkedIn lead form, with newsletter tick (waiting for confirmation)' : 'LinkedIn lead form',
        form_version: tidy(pick(row, 'form name', 'form'), 80) || 'LinkedIn lead form',
        wording: ticked ? s.linkedin_wording : s.linkedin_privacy_wording,
        evidence: `LinkedIn export, lead ${tidy(pick(row, 'lead id', 'id'), 40) || 'id not in file'}, submitted ${tidy(pick(row, 'submitted on', 'submitted at', 'date', 'created'), 40) || 'date not in file'}`,
      });
      report.push({ as_typed: r.as_typed || tidy(pick(row, 'email address', 'email'), 120), result: r.result, why: r.why || (r.result === 'merged' ? 'same person already in the list' : ''), stage: r.contact?.stage || '' });
    }
    return done(json({ ok: true, report, ...summary(tabs) }));
  }

  if (what === 'clicks') {
    const report = [];
    for (const row of parseCsv(body.csv)) {
      const email = cleanEmail(pick(row, 'email', 'email address'));
      const c = email && findBy('match_key', matchKey(email));
      if (!c) { report.push({ result: 'skipped', why: email ? 'not in the list' : 'no usable address' }); continue; }
      const before = c.stage;
      c.clicks = String(Math.max(num(c.clicks), num(pick(row, 'clicks', 'total clicks', 'unique clicks'))));  // a report holds totals, so it never lowers a count
      c.last_updated = at;
      restage(c, s, at);
      report.push({ result: 'updated', from: before, to: c.stage });
    }
    changed.add('contacts');
    return done(json({ ok: true, report, ...summary(tabs) }));
  }

  if (what === 'unsubscribe') {
    const email = cleanEmail(body.email);
    if (!email) return done(json({ ok: false, error: 'Enter the address to unsubscribe.' }));
    const key = matchKey(email);
    const c = findBy('match_key', key);
    if (c) unsubscribe(c, 'Request to the team', tidy(body.reason, 160) || 'Asked to be removed');
    else if (!suppressed(key)) {   // not in the list: still suppress, so a later import can't add them
      tabs.suppression.rows.push({ added_at: at, match_key: key, email, reason: tidy(body.reason, 160) || 'Asked to be removed', how: 'Request to the team' });
      changed.add('suppression');
    }
    return done(json({ ok: true, message: 'On the suppression list.', ...summary(tabs) }));
  }

  if (what === 'drafts') {
    const blocking = new Set(['To review', 'Sent', 'Withdrawn: unsubscribed']);
    const ai = [], skipped = [];
    for (const c of tabs.contacts.rows.filter((x) => x.stage === 'Opportunity')) {
      const who = [c.first_name, c.organisation && `(${c.organisation})`].filter(Boolean).join(' ') || c.match_key;
      if (suppressed(c.match_key)) { skipped.push({ who, why: 'on the suppression list' }); continue; }
      if (tabs.drafts.rows.some((d) => d.match_key === c.match_key && blocking.has(d.status))) { skipped.push({ who, why: 'already has a draft' }); continue; }
      // A personal note needs a reason to write: they asked us something, or asked for a follow-up on LinkedIn.
      // Newsletter consent covers the newsletter, not one-to-one sales emails.
      if (!(num(c.enquiries) > 0 || c.sources.includes('LinkedIn'))) { skipped.push({ who, why: 'newsletter consent only, so invite them through the newsletter instead' }); continue; }
      if (ai.length >= num(s.max_drafts_per_run)) { skipped.push({ who, why: 'over this run\'s limit, run again' }); continue; }
      const facts = { first_name: c.first_name || '(not given)', organisation: c.organisation || '(not given)', job_title: c.job_title || '(not given)', how_they_found_us: c.sources, why_now: c.stage_reason, their_enquiry: mask(c.last_enquiry) || '(no message)', newsletter: c.newsletter };
      ai.push({
        key: c.match_key, first_name: c.first_name, organisation: c.organisation, why_now: c.stage_reason,
        request: {
          model: s.model, max_tokens: 1024,
          output_config: { effort: 'low', format: { type: 'json_schema', schema: { type: 'object', properties: { subject: { type: 'string' }, body: { type: 'string' } }, required: ['subject', 'body'], additionalProperties: false } } },
          system: String(s.system_prompt).replace(/\{(\w+)\}/g, (m, k) => s[k] ?? m),
          messages: [{ role: 'user', content: 'Write the follow-up note for this contact. Facts:\n' + JSON.stringify(facts, null, 2) }],
        },
      });
    }
    return [{ json: { action, tabs, save: false, write: writeBody(tabs, []), ai, skipped, response_type: 'application/json', response_body: JSON.stringify({ ok: true, drafted: 0, skipped, ...summary(tabs) }) } }];
  }

  return done(json({ ok: true, ...summary(tabs) }));   // view
}

return done(json({ ok: false, error: `Unknown request "${action}".` }));
