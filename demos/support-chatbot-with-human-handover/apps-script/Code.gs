/**
 * Support chatbot with human handover (demo): the Google Sheets side.
 * Paste this file and appsscript.json into Extensions > Apps Script on a new, empty Google Sheet.
 *
 * The chat app POSTs one handover ticket at a time as JSON: { secret, row: { ticket_id, created, ... } }.
 * doPost checks the secret (kept in Project Settings > Script properties as TICKETS_SECRET) and appends
 * one row to the Tickets tab. It cannot read, change or delete anything else, and it sends nothing.
 *
 * Menu "Support demo":
 *   Set up Tickets tab   - first time only: header row, column widths, frozen header.
 *   Clear demo tickets   - before a Loom take: removes every row below the header.
 */

var TAB = 'Tickets';

// Column order of the Tickets tab. The keys match sheetRow() in lib/sheets.ts.
var TICKET_HEADERS = [
  ['ticket_id', 'Ticket'],
  ['created', 'Created'],
  ['reason', 'Why it was handed over'],
  ['topic', 'Topic'],
  ['first_name', 'First name'],
  ['order_number', 'Order number'],
  ['summary', 'Summary for the team'],
  ['last_question', 'Last question'],
  ['articles_tried', 'Articles shown'],
  ['flow', 'Troubleshooting steps'],
  ['transcript', 'Chat transcript'],
  ['status', 'Status'],
];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Support demo')
    .addItem('Set up Tickets tab', 'setupTickets')
    .addItem('Clear demo tickets', 'clearTickets')
    .addToUi();
}

function ticketsSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(TAB);
  if (!sh) {
    sh = ss.insertSheet(TAB);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(TICKET_HEADERS.map(function (h) { return h[1]; }));
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, TICKET_HEADERS.length).setFontWeight('bold').setBackground('#e3ebe1');
    [90, 140, 190, 100, 90, 110, 360, 240, 200, 260, 420, 80].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  }
  return sh;
}

function setupTickets() {
  ticketsSheet_();
  SpreadsheetApp.getActive().toast('Tickets tab ready.', 'Support demo');
}

function clearTickets() {
  var sh = ticketsSheet_();
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  SpreadsheetApp.getActive().toast('Demo tickets cleared.', 'Support demo');
}

function reply_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Apps Script cannot read request headers, so the secret travels in the JSON body.
 * The reply goes back through Google's one-time redirect (script.googleusercontent.com); the app follows it.
 */
function doPost(e) {
  var expected = PropertiesService.getScriptProperties().getProperty('TICKETS_SECRET');
  var data;
  try {
    data = JSON.parse(e && e.postData ? e.postData.contents : '');
  } catch (err) {
    return reply_({ ok: false, error: 'not JSON' });
  }
  if (!expected || !data || data.secret !== expected) return reply_({ ok: false, error: 'not allowed' });

  var row = data.row || {};
  if (!row.ticket_id) return reply_({ ok: false, error: 'no ticket id' });

  // One write at a time, so two handovers in the same second cannot land on the same row.
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var sh = ticketsSheet_();
    // A cell holds at most 50,000 characters; the app already shortens transcripts, this is a backstop.
    var values = TICKET_HEADERS.map(function (h) {
      var v = row[h[0]] == null ? '' : String(row[h[0]]);
      // A leading = + - @ would be read as a formula; prefix it so customer text always stays text.
      if (/^[=+\-@]/.test(v)) v = "'" + v;
      return v.slice(0, 49000);
    });
    sh.appendRow(values);
    return reply_({ ok: true, row: sh.getLastRow() });
  } finally {
    lock.releaseLock();
  }
}

/** A plain GET (someone opening the address in a browser) learns nothing. */
function doGet() {
  return reply_({ ok: false, error: 'POST only' });
}
