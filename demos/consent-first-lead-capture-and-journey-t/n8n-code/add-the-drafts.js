// Pairs each Claude reply with its contact, checks the wording in code, and adds the drafts to the review tab.
// The greeting, sign-off and opt-out line are added here, never left to the AI. Nothing is sent.
const s = $('Settings').first().json;
const state = $('Apply the change').first().json;
const tabs = state.tabs;
const asked = $('One item per draft').all().map((i) => i.json);
const replies = $input.all().map((i) => i.json);
const at = nowStamp();
let drafted = 0;
const failed = [];

// What a draft may not contain. A person reviews every draft anyway; these catch the obvious slips.
const problemsOf = (subject, text) => {
  const p = [];
  if (!subject || subject.length > 60) p.push('subject missing or over 60 characters');
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 15 || words > num(s.max_words)) p.push(`${words} words (keep it to ${s.max_words})`);
  if (/https?:\/\/|www\./i.test(text)) p.push('has a link');
  if (/[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s().-]{8,}\d/.test(text)) p.push('has contact details');
  if (/[£$€]\s?\d|\d\s?%|\b\d+x\b/i.test(subject + ' ' + text)) p.push('states a figure');
  if (/\b(guarantee|guaranteed|promise)\b/i.test(text)) p.push('makes a promise');
  if (/\bevery (day|week|month)\b|\b(many|hundreds of|dozens of) (clients|organisations|charities|trusts)\b|\bwe(?:'ve| have) helped\b/i.test(text)) p.push('claims a track record');
  return p;
};

asked.forEach((a, i) => {
  const r = replies[i] || {};
  const row = { drafted_at: at, match_key: a.key, first_name: a.first_name, organisation: a.organisation, why_now: a.why_now, subject: '', draft: '', status: '', model: s.model };
  let out = null;
  try {
    const text = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (r.stop_reason === 'end_turn') out = JSON.parse(text);
  } catch (e) { out = null; }
  if (!out) {
    row.status = 'Draft failed: run again';
    failed.push(a.first_name || a.key);
  } else {
    const subject = tidy(out.subject, 80);
    const note = mask(String(out.body || '').replace(/\r/g, '').trim());
    const problems = problemsOf(subject, note);
    row.subject = subject;
    row.draft = `Hi ${a.first_name || 'there'},\n\n${note}\n\n${s.sender_name}\n${s.business_name}\n\n${s.opt_out_line}`;
    row.status = problems.length ? 'Check: ' + problems.join('; ') : 'To review';
    if (!problems.length) drafted++;
  }
  // A failed or flagged draft from an earlier run is replaced, not duplicated.
  const old = tabs.drafts.rows.findIndex((d) => d.match_key === a.key && (d.status.startsWith('Draft failed') || d.status.startsWith('Check:')));
  if (old >= 0) tabs.drafts.rows[old] = row; else tabs.drafts.rows.push(row);
});

const reply = { ok: true, drafted, failed, skipped: state.skipped, ...summary(tabs) };
return [{ json: { ...state, save: true, write: writeBody(tabs, ['drafts']), response_type: 'application/json', response_body: JSON.stringify(reply) } }];
