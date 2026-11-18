/**
 * Invoice inbox to draw request (demo): the rules, with no Google calls in them.
 *
 * Apps Script loads every .gs file into one scope, so Code.gs calls these directly.
 * The local runner (scripts/sheet_logic.mjs) loads this same file in Node, so the rules
 * that run in the sheet are the rules that were tested here. Change a rule here, once.
 *
 * Money is handled in whole pence so totals never pick up floating-point pennies.
 */

/** Tracker columns, in order. Code.gs finds columns by these names, so they can be moved. */
var TRACKER_HEADERS = [
  'Received', 'Email from', 'Subject', 'File', 'Drive link',
  'Vendor', 'Invoice no', 'Invoice date', 'Amount', 'Project',
  'Extraction notes', 'Status', 'Notes', 'Draw no', 'Checked at'
];

/** Header name -> field name used in the row objects below. */
var TRACKER_FIELDS = {
  'Received': 'received', 'Email from': 'from', 'Subject': 'subject', 'File': 'file',
  'Drive link': 'drive_link', 'Vendor': 'vendor', 'Invoice no': 'invoice_number',
  'Invoice date': 'invoice_date', 'Amount': 'amount', 'Project': 'project',
  'Extraction notes': 'extraction_notes', 'Status': 'status', 'Notes': 'notes',
  'Draw no': 'draw_no', 'Checked at': 'checked_at'
};

var STATUS = { NEW: 'New', READY: 'Ready', REVIEW: 'Review', DUPLICATE: 'Duplicate', APPROVED: 'Approved' };

/** The three made-up projects. setupDemo() writes them to the Projects tab. */
var DEMO_PROJECTS = [
  { code: 'OAK', name: 'Oakwood Rise', site: 'Plot 3, Oakwood Rise, Exampleton EX1 2AB', review_above: 15000 },
  { code: 'MILL', name: 'Millbrook Barn', site: 'Millbrook Lane, Sampleford SF4 7CD', review_above: 15000 },
  { code: 'HTH', name: 'Heath House', site: '2 Heath Road, Demoton DM9 3EF', review_above: 15000 }
];

/**
 * The demo draw template. Markers in {{ }} are filled by layoutDraw(); the row whose first
 * cell is {{lines}} becomes one row per invoice, with columns taken from the header row above it.
 * A client's own template only needs these markers added.
 */
var DEMO_TEMPLATE = [
  ['Monthly draw request (demo)', '', '', '', ''],
  ['Builder', 'Example Homes (demo)', '', '', ''],
  ['Project', '{{project}}', '', '', ''],
  ['Site', '{{site}}', '', '', ''],
  ['Period', '{{period}}', '', '', ''],
  ['Draw number', '{{draw_no}}', '', '', ''],
  ['Prepared', '{{prepared}}', '', '', ''],
  ['', '', '', '', ''],
  ['Vendor', 'Invoice no', 'Invoice date', 'Amount', 'PDF'],
  ['{{lines}}', '', '', '', ''],
  ['', '', '', '', ''],
  ['', '', 'Total this draw', '{{total}}', ''],
  ['Invoices in this draw', '{{count}}', '', '', ''],
  ['Leaves out invoices already in an earlier draw. Totals are worked out in code, not by AI.', '', '', '', '']
];

/** Template line headers -> what goes in that column. Unknown headers are left blank. */
var LINE_COLUMNS = {
  'vendor': 'vendor', 'invoice no': 'invoice_number', 'invoice number': 'invoice_number',
  'invoice date': 'invoice_date', 'date': 'invoice_date', 'amount': 'amount', 'pdf': 'drive_link',
  'drive link': 'drive_link', 'project': 'project'
};

// ---------------------------------------------------------------- normalising

function isBlank(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

/** "Brindlewire Electrical Ltd." and "BRINDLEWIRE ELECTRICAL LIMITED" are the same vendor. */
function normVendor(v) {
  if (isBlank(v)) return '';
  return String(v).toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(ltd|limited|llp|plc|co|company|uk)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

/** "CS/2026/311", "cs-2026-311" and "CS 2026 311" are the same invoice number. */
function normNumber(v) {
  if (isBlank(v)) return '';
  return String(v).toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

/** 4608, "4608.00", "£4,608.00" -> 460800 pence. Anything else -> null. */
function toPence(v) {
  if (typeof v === 'number') return isFinite(v) ? Math.round(v * 100) : null;
  if (isBlank(v)) return null;
  var s = String(v).replace(/[£,\s]/g, '').replace(/^GBP/i, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

function poundsText(pence) {
  var neg = pence < 0;
  var p = Math.abs(pence);
  var whole = String(Math.floor(p / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  var frac = String(p % 100);
  return (neg ? '-' : '') + '£' + whole + '.' + (frac.length < 2 ? '0' + frac : frac);
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

/** A Date, "2026-10-05" or "05/10/2026" (UK order) -> "2026-10-05". Anything else -> null. */
function toIsoDate(v) {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.getFullYear() + '-' + pad2(v.getMonth() + 1) + '-' + pad2(v.getDate());
  }
  if (isBlank(v)) return null;
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    var uk = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!uk) return null;
    m = [null, uk[3], pad2(+uk[2]), pad2(+uk[1])];
  }
  var y = +m[1], mo = +m[2], d = +m[3];
  var dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return m[1] + '-' + m[2] + '-' + m[3];
}

/** "2026-10" -> "2026-10-31". */
function monthEnd(month) {
  var m = String(month || '').match(/^(\d{4})-(\d{2})$/);
  if (!m || +m[2] < 1 || +m[2] > 12) return null;
  var last = new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate();
  return m[1] + '-' + m[2] + '-' + pad2(last);
}

/** Match what extraction returned (a code, a name or a site) to a known project code, or null. */
function matchProject(value, projects) {
  if (isBlank(value)) return null;
  var v = String(value).trim().toLowerCase();
  for (var i = 0; i < projects.length; i++) {
    var p = projects[i];
    if (v === String(p.code).toLowerCase() || v === String(p.name).toLowerCase()) return p.code;
  }
  return null;
}

function findProject(code, projects) {
  for (var i = 0; i < projects.length; i++) if (projects[i].code === code) return projects[i];
  return null;
}

// ---------------------------------------------------------------- checking new rows

/**
 * Decide the status of one new row, given the rows above it.
 * Duplicate beats Review: a duplicate should never be paid, whatever else is wrong with it.
 * Returns { status, notes } where notes is a list of plain reasons for the Notes column.
 */
function checkRow(row, earlierRows, projects, todayIso) {
  var vendor = normVendor(row.vendor);
  var number = normNumber(row.invoice_number);
  var pence = toPence(row.amount);

  for (var i = 0; i < earlierRows.length; i++) {
    var e = earlierRows[i];
    if (!vendor || normVendor(e.vendor) !== vendor) continue;
    var ref = 'row ' + (e._row || i + 2); // sheet row: data starts under the header in row 2
    if (number && normNumber(e.invoice_number) === number) {
      return { status: STATUS.DUPLICATE, notes: ['Same vendor and invoice number as ' + ref + '.'] };
    }
    if (pence !== null && toPence(e.amount) === pence) {
      return {
        status: STATUS.DUPLICATE,
        notes: ['Same vendor and amount as ' + ref + (isBlank(e.invoice_number) ? '' : ' (' + e.invoice_number + ')') + '.']
      };
    }
  }

  var notes = [];
  if (!vendor) notes.push('Vendor missing.');
  if (!number) notes.push('Invoice number missing.');
  var iso = toIsoDate(row.invoice_date);
  if (!iso) notes.push(isBlank(row.invoice_date) ? 'Invoice date missing.' : 'Invoice date not readable.');
  else if (todayIso && iso > todayIso) notes.push('Invoice date is in the future.');

  var code = matchProject(row.project, projects);
  if (isBlank(row.project)) notes.push('Project missing.');
  else if (!code) notes.push('Unknown project "' + row.project + '".');

  if (pence === null) notes.push(isBlank(row.amount) ? 'Amount missing.' : 'Amount not readable.');
  else if (pence <= 0) notes.push('Amount is zero or negative.');
  else if (code) {
    var p = findProject(code, projects);
    var limit = toPence(p.review_above);
    if (limit !== null && pence > limit) notes.push('Amount is above the ' + poundsText(limit) + ' review limit for ' + code + '.');
  }

  if (!isBlank(row.extraction_notes)) notes.push('Extraction: ' + row.extraction_notes);
  return { status: notes.length ? STATUS.REVIEW : STATUS.READY, notes: notes };
}

/**
 * Check every row whose status is blank or New, top to bottom, each against the rows above it.
 * Returns [{ index, status, notes, project }] for the caller to write back.
 */
function checkNewRows(rows, projects, todayIso) {
  var updates = [];
  for (var i = 0; i < rows.length; i++) {
    var st = String(rows[i].status || '').trim();
    if (st !== '' && st !== STATUS.NEW) continue;
    var result = checkRow(rows[i], rows.slice(0, i), projects, todayIso);
    updates.push({
      index: i,
      status: result.status,
      notes: result.notes.join(' '),
      project: matchProject(rows[i].project, projects) || rows[i].project || ''
    });
  }
  return updates;
}

// ---------------------------------------------------------------- draw requests

/** "MILL-D01", "MILL-D02", ... counted from the draw numbers already stamped in the tracker. */
function nextDrawNo(rows, code) {
  var max = 0;
  var re = new RegExp('^' + code + '-D(\\d+)$');
  for (var i = 0; i < rows.length; i++) {
    var m = String(rows[i].draw_no || '').match(re);
    if (m && +m[1] > max) max = +m[1];
  }
  var n = max + 1;
  return code + '-D' + (n < 10 ? '0' + n : n);
}

/**
 * Work out a draw for one project and month.
 * In: Approved rows for this project, dated on or before the month end, with no draw number yet.
 * Rows already in a draw are never looked at again, which is what stops double counting.
 * Everything else for the project (and any row with no known project) is listed as an exception.
 */
function planDraw(rows, projects, code, month) {
  var project = findProject(code, projects);
  if (!project) return { ok: false, message: 'Unknown project code "' + code + '".' };
  var end = monthEnd(month);
  if (!end) return { ok: false, message: 'Month must look like 2026-10.' };

  var lines = [], exceptions = [], total = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!isBlank(r.draw_no)) continue;
    var rowCode = matchProject(r.project, projects);
    var mine = rowCode === code;
    if (!mine && rowCode) continue;
    var base = { index: i, row: r._row || i + 2, vendor: r.vendor || '', invoice_number: r.invoice_number || '', amount: r.amount, status: r.status || '' };
    if (!rowCode) { base.reason = 'No known project, so not in any draw. ' + (r.notes || ''); exceptions.push(base); continue; }

    var st = String(r.status || '').trim();
    var iso = toIsoDate(r.invoice_date);
    var pence = toPence(r.amount);
    if (st === STATUS.DUPLICATE) base.reason = 'Duplicate. ' + (r.notes || '');
    else if (st === STATUS.REVIEW) base.reason = 'Needs review. ' + (r.notes || '');
    else if (st !== STATUS.APPROVED) base.reason = 'Not approved yet (status "' + (st || 'blank') + '").';
    else if (!iso) base.reason = 'Approved, but the invoice date is not readable.';
    else if (iso > end) base.reason = 'Dated after this period; it will go in a later draw.';
    else if (pence === null || pence <= 0) base.reason = 'Approved, but the amount is not usable.';
    if (base.reason) { base.reason = base.reason.trim(); exceptions.push(base); continue; }

    total += pence;
    lines.push({ index: i, vendor: r.vendor, invoice_number: r.invoice_number, invoice_date: iso, amount_pence: pence, drive_link: r.drive_link || '', project: code });
  }

  if (!lines.length) {
    return {
      ok: false, nothing: true, exceptions: exceptions,
      message: 'Nothing to draw for ' + code + ' up to ' + end + ': no approved invoices that are not already in a draw.'
    };
  }
  lines.sort(function (a, b) { return a.invoice_date < b.invoice_date ? -1 : a.invoice_date > b.invoice_date ? 1 : a.index - b.index; });
  return {
    ok: true, project: project, period: month, period_end: end,
    draw_no: nextDrawNo(rows, code), lines: lines, total_pence: total, exceptions: exceptions
  };
}

/**
 * Fill a template grid for a planned draw. Returns { grid, linesRow, inserted, moneyCells }:
 * linesRow is the 0-based row of {{lines}}, inserted is how many rows the sheet must insert
 * after it before writing grid, and moneyCells lists [row, col] cells to format as pounds.
 */
function layoutDraw(template, plan, preparedIso) {
  var linesRow = -1;
  for (var r = 0; r < template.length; r++) if (String(template[r][0]).trim() === '{{lines}}') { linesRow = r; break; }
  if (linesRow < 1) throw new Error('The template needs a {{lines}} cell in column A, under a row of column headings.');
  var width = template[0].length;
  var heads = template[linesRow - 1].map(function (h) { return LINE_COLUMNS[String(h).trim().toLowerCase()] || null; });

  var marks = {
    '{{project}}': plan.project.code + ' - ' + plan.project.name,
    '{{site}}': plan.project.site || '',
    '{{period}}': plan.period,
    '{{draw_no}}': plan.draw_no,
    '{{prepared}}': preparedIso,
    '{{count}}': plan.lines.length
  };
  var grid = [], money = [];
  for (r = 0; r < template.length; r++) {
    if (r === linesRow) {
      for (var k = 0; k < plan.lines.length; k++) {
        var L = plan.lines[k], out = [];
        for (var c = 0; c < width; c++) {
          var f = heads[c];
          if (f === 'amount') { out.push(L.amount_pence / 100); money.push([grid.length, c]); }
          else out.push(f ? L[f] : '');
        }
        grid.push(out);
      }
      continue;
    }
    var row = [];
    for (c = 0; c < width; c++) {
      var cell = template[r][c];
      var s = String(cell).trim();
      if (s === '{{total}}') { row.push(plan.total_pence / 100); money.push([grid.length, c]); }
      else if (Object.prototype.hasOwnProperty.call(marks, s)) row.push(marks[s]);
      else row.push(cell);
    }
    grid.push(row);
  }
  return { grid: grid, linesRow: linesRow, inserted: plan.lines.length - 1, moneyCells: money };
}

/** Rows for the Draw exceptions tab. */
function exceptionRows(plan, code, month) {
  var out = [['Draw exceptions (demo)', 'Project ' + code, 'Period ' + month, '', ''],
             ['Tracker row', 'Vendor', 'Invoice no', 'Amount', 'Why it is not in the draw']];
  var list = plan.exceptions || [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    var p = toPence(e.amount);
    out.push([e.row, e.vendor, e.invoice_number || '(none)', p === null ? '' : poundsText(p), e.reason]);
  }
  if (!list.length) out.push(['', '', '', '', 'No exceptions.']);
  return out;
}

// Node (the local runner and tests) reads these; Apps Script ignores this block.
if (typeof module !== 'undefined') {
  module.exports = {
    TRACKER_HEADERS: TRACKER_HEADERS, TRACKER_FIELDS: TRACKER_FIELDS, STATUS: STATUS,
    DEMO_PROJECTS: DEMO_PROJECTS, DEMO_TEMPLATE: DEMO_TEMPLATE,
    normVendor: normVendor, normNumber: normNumber, toPence: toPence, poundsText: poundsText,
    toIsoDate: toIsoDate, monthEnd: monthEnd, matchProject: matchProject,
    checkRow: checkRow, checkNewRows: checkNewRows, nextDrawNo: nextDrawNo,
    planDraw: planDraw, layoutDraw: layoutDraw, exceptionRows: exceptionRows
  };
}
