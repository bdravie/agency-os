// The sample data as a sequence of requests, used both by the local run (engine.mjs) and against a real n8n (load-sample.mjs).
// call(path, fields) posts a form (or GETs when fields is null and the path has a query) and returns { type, body }.
import { readFileSync } from 'node:fs';

const DATA = new URL('../sample-data/', import.meta.url);
const read = (f) => readFileSync(new URL(f, DATA), 'utf8');
const forms = JSON.parse(read('website-forms.json')).submissions;
const unsubs = JSON.parse(read('unsubscribe-requests.json')).requests;
export const LOOM_SIGNUP = JSON.parse(read('loom/imogen-signup.json'));

const tokenFrom = (link) => new URL(link).searchParams.get('t');
const fieldsOf = (f) => Object.fromEntries(Object.entries(f).filter(([k, v]) => !k.startsWith('_') && k !== 'confirm' && v !== ''));
const parse = (r) => (r.type.startsWith('application/json') ? JSON.parse(r.body) : r.body);

// Everything before the Loom: 24 contacts from the website and a LinkedIn export, some confirmed, click counts, one unsubscribe.
export const seed = async (call, key, say = () => {}) => {
  const unsubLinks = {};
  for (const f of forms) {
    const r = parse(await call('signup', fieldsOf(f)));
    if (!r.ok) throw new Error(`sign-up refused for ${f.email}: ${r.message}`);
    if (f.confirm) {
      const t = tokenFrom(r.demo_confirm_link);
      await call(`confirm?t=${t}`, null);                         // opens the link: a page with a button
      const page = await call('confirmed', { t });               // presses the button
      unsubLinks[f.email.trim().toLowerCase()] = page.body.match(/href="([^"]*unsubscribe\?t=[^"]+)"/)[1];
    }
    say(`website ${f.form.padEnd(10)} ${f.email.trim()}${f.confirm ? '  (confirmed by link)' : ''}`);
  }
  const li = parse(await call('team', { key, action: 'linkedin', csv: read('linkedin-lead-export.csv') }));
  for (const row of li.report) say(`linkedin   ${row.result.padEnd(8)} ${row.as_typed}${row.why ? '  (' + row.why + ')' : ''}`);
  const clicks = parse(await call('team', { key, action: 'clicks', csv: read('newsletter-clicks.csv') }));
  say(`clicks     ${clicks.report.filter((r) => r.result === 'updated').length} contacts updated from the newsletter click report`);
  for (const u of unsubs.filter((x) => !x.loom)) {
    const link = unsubLinks[u.email];
    await call(link.split('/lead-capture/')[1], null);
    await call('unsubscribed', { t: tokenFrom(link) });
    say(`unsub      ${u.email} (${u.note})`);
  }
};

// The three Loom steps, scripted: Imogen signs up, her LinkedIn lead arrives, she confirms; Sofia asks to be removed; drafts.
export const loom = async (call, key, say = () => {}) => {
  const r1 = parse(await call('signup', fieldsOf(LOOM_SIGNUP)));
  say(`1. sign-up  ${LOOM_SIGNUP.email}: ${r1.message}`);
  const li = parse(await call('team', { key, action: 'linkedin', csv: read('loom/linkedin-new-lead.csv') }));
  say(`1. linkedin ${li.report[0].as_typed}: ${li.report[0].result} (${li.report[0].why}), stage ${li.report[0].stage}`);
  const t = tokenFrom(r1.demo_confirm_link);
  await call(`confirm?t=${t}`, null);
  if (!(await call('confirmed', { t })).body.includes("You're subscribed")) throw new Error('Imogen\'s confirm link did not work');
  const after = parse(await call('team', { key, action: 'view' })).contacts.find((c) => c.name === 'Imogen Thackeray');
  say(`2. confirm  Imogen Thackeray is now ${after.stage} (${after.why})`);
  const sofia = unsubs.find((x) => x.loom);
  await call('team', { key, action: 'unsubscribe', email: sofia.email, reason: sofia.reason });
  say(`3. unsub    ${sofia.email} (${sofia.reason})`);
  const d = parse(await call('team', { key, action: 'drafts' }));
  say(`3. drafts   ${d.drafted} written to Follow-up drafts${d.failed.length ? `, ${d.failed.length} failed` : ''}`);
  for (const s of d.skipped) say(`             skipped ${s.who}: ${s.why}`);
  return d;
};
