// Tests for apps-script/Logic.gs (the rules the Google Sheet runs). Free and offline:
//   node --test demos/invoice-inbox-to-draw-request/scripts/logic.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { logic as L } from './sheet_logic.mjs';

const P = L.DEMO_PROJECTS;
const TODAY = '2026-11-16';
const row = (o) => ({ vendor: 'Quillbeck Timber Ltd', invoice_number: 'INV-1', invoice_date: '2026-10-02', amount: 100, project: 'OAK', status: 'New', notes: '', draw_no: '', extraction_notes: '', ...o });

test('vendor and number are compared without case, punctuation or Ltd', () => {
  assert.equal(L.normVendor('HIGHPEG SCAFFOLD HIRE LTD'), L.normVendor('Highpeg Scaffold Hire Limited.'));
  assert.equal(L.normNumber('CS/2026/311'), L.normNumber('cs-2026 311'));
});

test('money is read in pence and never picks up floating-point pennies', () => {
  assert.equal(L.toPence('£2,294.88'), 229488);
  assert.equal(L.toPence(0.1 + 0.2), 30);
  assert.equal(L.toPence('about 300'), null);
  assert.equal(L.poundsText(924000), '£9,240.00');
});

test('dates: ISO, UK order and impossible dates', () => {
  assert.equal(L.toIsoDate('05/10/2026'), '2026-10-05');
  assert.equal(L.toIsoDate('2026-02-30'), null);
  assert.equal(L.monthEnd('2026-02'), '2026-02-28');
});

test('same vendor and invoice number is a duplicate, even written differently', () => {
  const rows = [row({ status: 'Approved' }), row({ vendor: 'QUILLBECK TIMBER LIMITED', invoice_number: 'inv 1', amount: 999 })];
  const [u] = L.checkNewRows(rows, P, TODAY);
  assert.equal(u.status, 'Duplicate');
  assert.match(u.notes, /row 2/);
});

test('same vendor and amount is a duplicate; another vendor with that amount is not', () => {
  const rows = [row({ status: 'Approved' }), row({ invoice_number: 'INV-2' }), row({ vendor: 'Tarnbrook Groundworks Ltd', invoice_number: 'T-1' })];
  const u = L.checkNewRows(rows, P, TODAY);
  assert.equal(u[0].status, 'Duplicate');
  assert.equal(u[1].status, 'Ready');
});

test('missing number, unknown project, odd amounts and future dates go to Review with reasons', () => {
  const check = (o) => L.checkRow(row(o), [], P, TODAY);
  assert.deepEqual(check({ invoice_number: '' }).notes, ['Invoice number missing.']);
  assert.match(check({ project: 'Fernlea Court' }).notes.join(), /Unknown project "Fernlea Court"/);
  assert.match(check({ amount: 15000.01 }).notes.join(), /above the £15,000.00 review limit/);
  assert.match(check({ amount: -5 }).notes.join(), /zero or negative/);
  assert.match(check({ invoice_date: '2026-12-01' }).notes.join(), /future/);
  assert.equal(check({ extraction_notes: 'two totals shown' }).status, 'Review');
  assert.equal(check({}).status, 'Ready');
});

test('only blank or New rows are checked; a human-set status is never overwritten', () => {
  const rows = [row({ status: 'Approved' }), row({ invoice_number: 'INV-9', amount: 5, status: 'Review' }), row({ invoice_number: 'INV-3', amount: 7, status: '' })];
  const u = L.checkNewRows(rows, P, TODAY);
  assert.deepEqual(u.map((x) => x.index), [2]);
});

test('a draw takes approved, undrawn rows for the project up to the month end, and totals them in code', () => {
  const rows = [
    row({ project: 'MILL', amount: 7500, status: 'Approved', invoice_date: '2026-10-05' }),
    row({ project: 'MILL', amount: 1740, status: 'Approved', invoice_date: '2026-09-28', invoice_number: 'INV-2' }),
    row({ project: 'MILL', amount: 10, status: 'Approved', invoice_date: '2026-11-02', invoice_number: 'INV-3' }),
    row({ project: 'MILL', amount: 20, status: 'Approved', draw_no: 'MILL-D01', invoice_number: 'INV-4' }),
    row({ project: 'MILL', amount: 30, status: 'Review', invoice_number: 'INV-5', notes: 'Invoice number missing.' }),
    row({ project: 'OAK', amount: 40, status: 'Approved', invoice_number: 'INV-6' }),
    row({ project: 'Fernlea Court', amount: 50, status: 'Review', invoice_number: 'INV-7' })
  ];
  const plan = L.planDraw(rows, P, 'MILL', '2026-10');
  assert.equal(plan.ok, true);
  assert.equal(plan.draw_no, 'MILL-D02');
  assert.deepEqual(plan.lines.map((l) => l.index), [1, 0]);
  assert.equal(plan.total_pence, 924000);
  const why = Object.fromEntries(plan.exceptions.map((e) => [e.index, e.reason]));
  assert.match(why[2], /after this period/);
  assert.match(why[4], /Needs review/);
  assert.match(why[6], /No known project/);
  assert.equal(why[3], undefined, 'rows already in a draw are not exceptions');
  assert.equal(why[5], undefined, 'other projects are not listed');
});

test('stamping the draw number stops double counting on the next run', () => {
  const rows = [row({ project: 'MILL', status: 'Approved' })];
  const first = L.planDraw(rows, P, 'MILL', '2026-10');
  first.lines.forEach((l) => { rows[l.index].draw_no = first.draw_no; });
  const second = L.planDraw(rows, P, 'MILL', '2026-10');
  assert.equal(second.ok, false);
  assert.equal(second.nothing, true);
});

test('bad input to a draw is refused, not guessed', () => {
  assert.equal(L.planDraw([], P, 'XYZ', '2026-10').ok, false);
  assert.equal(L.planDraw([], P, 'MILL', 'October').ok, false);
});

test('the template is filled by its markers, one line per invoice, columns from the header row', () => {
  const rows = [row({ project: 'MILL', amount: 7500, status: 'Approved' }), row({ project: 'MILL', amount: 1740, status: 'Approved', invoice_number: 'INV-2' })];
  const plan = L.planDraw(rows, P, 'MILL', '2026-10');
  const lay = L.layoutDraw(L.DEMO_TEMPLATE, plan, TODAY);
  assert.equal(lay.inserted, 1);
  assert.equal(lay.grid.length, L.DEMO_TEMPLATE.length + 1);
  assert.deepEqual(lay.grid[lay.linesRow].slice(0, 4), ['Quillbeck Timber Ltd', 'INV-1', '2026-10-02', 7500]);
  const flat = lay.grid.flat();
  assert.ok(flat.includes(9240), 'total');
  assert.ok(flat.includes('MILL - Millbrook Barn'));
  assert.ok(!flat.some((c) => /\{\{/.test(String(c))), 'no marker left unfilled');
  assert.throws(() => L.layoutDraw([['no markers']], plan, TODAY), /\{\{lines\}\}/);
});
