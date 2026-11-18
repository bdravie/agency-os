/**
 * Invoice inbox to draw request (demo): the Google Sheets side.
 * Paste this file, Logic.gs and appsscript.json into Extensions > Apps Script on the tracker sheet.
 * All the rules live in Logic.gs; this file only reads and writes the sheet.
 *
 * Menu "Invoices (demo)":
 *   Check new rows      - marks New rows Ready, Review or Duplicate (Make also calls this through doGet).
 *   Generate draw...    - asks for a project and month, copies the Draw template tab and fills it.
 *   Set up demo tabs    - first time only: Tracker, Projects, Draw template, Draw exceptions.
 *   Demo: approve Ready - stands in for the admin approving rows by hand (approval is out of scope).
 *
 * Nothing here sends email or shares anything. The web endpoint only re-checks rows.
 */

var TABS = { TRACKER: 'Tracker', PROJECTS: 'Projects', TEMPLATE: 'Draw template', EXCEPTIONS: 'Draw exceptions' };

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Invoices (demo)')
    .addItem('Check new rows', 'menuCheckNewRows')
    .addItem('Generate draw...', 'generateDraw')
    .addSeparator()
    .addItem('Set up demo tabs', 'setupDemo')
    .addItem('Demo: approve all Ready rows', 'approveReadyDemo')
    .addToUi();
}

// ---------------------------------------------------------------- reading and writing

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function trackerSheet_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.TRACKER);
  if (!sh) throw new Error('No "' + TABS.TRACKER + '" tab. Run Invoices (demo) > Set up demo tabs first.');
  return sh;
}

/** Column number (1-based) for each header, found by name so columns can be moved. */
function columns_(sh) {
  var heads = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var cols = {};
  heads.forEach(function (h, i) { var f = TRACKER_FIELDS[String(h).trim()]; if (f) cols[f] = i + 1; });
  ['vendor', 'invoice_number', 'amount', 'project', 'status', 'notes', 'draw_no'].forEach(function (f) {
    if (!cols[f]) throw new Error('The Tracker tab is missing a column for "' + f + '".');
  });
  return cols;
}

function readRows_(sh, cols) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  return values.map(function (v, i) {
    var row = { _row: i + 2 };
    Object.keys(cols).forEach(function (f) { row[f] = v[cols[f] - 1]; });
    return row;
  });
}

function readProjects_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.PROJECTS);
  if (!sh || sh.getLastRow() < 2) return DEMO_PROJECTS;
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) { return { code: String(r[0]).trim(), name: String(r[1]).trim(), site: String(r[2]).trim(), review_above: r[3] }; });
}

function setCell_(sh, row, col, value) {
  if (col) sh.getRange(row, col).setValue(value);
}

// ---------------------------------------------------------------- checking

/** Returns how many rows were checked. Locked so Make and a menu click cannot check twice at once. */
function checkNewRows_() {
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var sh = trackerSheet_();
    var cols = columns_(sh);
    var rows = readRows_(sh, cols);
    var updates = checkNewRows(rows, readProjects_(), today_());
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    updates.forEach(function (u) {
      var r = rows[u.index]._row;
      setCell_(sh, r, cols.status, u.status);
      setCell_(sh, r, cols.notes, u.notes);
      setCell_(sh, r, cols.project, u.project);
      setCell_(sh, r, cols.checked_at, stamp);
    });
    return updates.length;
  } finally {
    lock.releaseLock();
  }
}

function menuCheckNewRows() {
  var n = checkNewRows_();
  SpreadsheetApp.getActive().toast(n + ' new row(s) checked.', 'Invoices (demo)');
}

/**
 * Make calls the web app address with ?key=... after adding a row, so duplicates are flagged at once.
 * The key is a random string kept in Project Settings > Script properties as CHECK_KEY; a call
 * without it does nothing. It only re-checks rows: it cannot read, add or delete anything else.
 */
function doGet(e) {
  var expected = PropertiesService.getScriptProperties().getProperty('CHECK_KEY');
  var given = e && e.parameter ? e.parameter.key : '';
  var body;
  if (!expected || given !== expected) body = { ok: false, error: 'not allowed' };
  else body = { ok: true, checked: checkNewRows_() };
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- draws

function generateDraw() {
  var ui = SpreadsheetApp.getUi();
  var projects = readProjects_();
  var codes = projects.map(function (p) { return p.code; }).join(', ');

  var a = ui.prompt('Generate draw', 'Project code (' + codes + '):', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var code = a.getResponseText().trim().toUpperCase();
  var b = ui.prompt('Generate draw', 'Month, as YYYY-MM (for example 2026-10):', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  var month = b.getResponseText().trim();

  var result = makeDraw_(code, month);
  ui.alert('Generate draw', result.message, ui.ButtonSet.OK);
}

/** Builds the draw tab, then stamps the rows. If filling the tab fails, the half-made tab is removed. */
function makeDraw_(code, month) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActive();
    var sh = trackerSheet_();
    var cols = columns_(sh);
    var rows = readRows_(sh, cols);
    var plan = planDraw(rows, readProjects_(), code, month);
    writeExceptions_(ss, plan, code, month);
    if (!plan.ok) return { message: plan.message + (plan.exceptions && plan.exceptions.length ? ' Exceptions are on the "' + TABS.EXCEPTIONS + '" tab.' : '') };

    var tpl = ss.getSheetByName(TABS.TEMPLATE);
    if (!tpl) throw new Error('No "' + TABS.TEMPLATE + '" tab.');
    var name = 'Draw ' + plan.draw_no;
    if (ss.getSheetByName(name)) throw new Error('A tab called "' + name + '" already exists. Rename or delete it first.');

    var out = tpl.copyTo(ss).setName(name);
    try {
      var lay = layoutDraw(tpl.getDataRange().getValues(), plan, today_());
      if (lay.inserted > 0) out.insertRowsAfter(lay.linesRow + 1, lay.inserted);
      out.getRange(1, 1, lay.grid.length, lay.grid[0].length).setValues(lay.grid);
      lay.moneyCells.forEach(function (rc) { out.getRange(rc[0] + 1, rc[1] + 1).setNumberFormat('£#,##0.00'); });
    } catch (err) {
      ss.deleteSheet(out);
      throw err;
    }

    plan.lines.forEach(function (l) { setCell_(sh, rows[l.index]._row, cols.draw_no, plan.draw_no); });
    SpreadsheetApp.flush();
    out.activate();
    return {
      message: name + ': ' + plan.lines.length + ' invoice(s), total ' + poundsText(plan.total_pence) +
        '. Those rows are stamped ' + plan.draw_no + ' and will not appear in a later draw. ' +
        plan.exceptions.length + ' exception(s) on the "' + TABS.EXCEPTIONS + '" tab.'
    };
  } finally {
    lock.releaseLock();
  }
}

function writeExceptions_(ss, plan, code, month) {
  var sh = ss.getSheetByName(TABS.EXCEPTIONS) || ss.insertSheet(TABS.EXCEPTIONS);
  sh.clear();
  var rows = exceptionRows(plan, code, month);
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.getRange(2, 1, 1, rows[0].length).setFontWeight('bold');
}

// ---------------------------------------------------------------- demo helpers

/** First time only: creates the four tabs with the made-up projects and the demo template. */
function setupDemo() {
  var ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(TABS.TRACKER)) {
    var t = ss.insertSheet(TABS.TRACKER);
    t.getRange(1, 1, 1, TRACKER_HEADERS.length).setValues([TRACKER_HEADERS]).setFontWeight('bold');
    t.setFrozenRows(1);
    var statusCol = TRACKER_HEADERS.indexOf('Status') + 1;
    t.getRange(2, statusCol, 999, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList([STATUS.NEW, STATUS.READY, STATUS.REVIEW, STATUS.DUPLICATE, STATUS.APPROVED], true)
      .setAllowInvalid(true).build());
    t.getRange(2, TRACKER_HEADERS.indexOf('Amount') + 1, 999, 1).setNumberFormat('£#,##0.00');
  }
  if (!ss.getSheetByName(TABS.PROJECTS)) {
    var p = ss.insertSheet(TABS.PROJECTS);
    var rows = [['Code', 'Name', 'Site', 'Review above (£)']].concat(DEMO_PROJECTS.map(function (x) { return [x.code, x.name, x.site, x.review_above]; }));
    p.getRange(1, 1, rows.length, 4).setValues(rows);
    p.getRange(1, 1, 1, 4).setFontWeight('bold');
  }
  if (!ss.getSheetByName(TABS.TEMPLATE)) {
    var d = ss.insertSheet(TABS.TEMPLATE);
    d.getRange(1, 1, DEMO_TEMPLATE.length, DEMO_TEMPLATE[0].length).setValues(DEMO_TEMPLATE);
    d.getRange(1, 1).setFontSize(14).setFontWeight('bold');
    d.getRange(9, 1, 1, 5).setFontWeight('bold').setBackground('#F4EDE0');
    d.getRange(12, 3, 1, 2).setFontWeight('bold');
    d.setColumnWidth(1, 220); d.setColumnWidth(5, 260);
  }
  if (!ss.getSheetByName(TABS.EXCEPTIONS)) ss.insertSheet(TABS.EXCEPTIONS);
  ss.getSheetByName(TABS.TRACKER).activate();
  ss.toast('Demo tabs ready.', 'Invoices (demo)');
}

/** Demo only: the admin would approve rows by hand. This sets every Ready row to Approved. */
function approveReadyDemo() {
  var sh = trackerSheet_();
  var cols = columns_(sh);
  var n = 0;
  readRows_(sh, cols).forEach(function (r) {
    if (String(r.status).trim() === STATUS.READY) { setCell_(sh, r._row, cols.status, STATUS.APPROVED); n++; }
  });
  SpreadsheetApp.getActive().toast(n + ' row(s) approved (demo stand-in for the admin).', 'Invoices (demo)');
}
