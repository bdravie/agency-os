import test from "node:test";
import assert from "node:assert/strict";
import { sessionStatus, plusOneMonth, nextAfter, advanceSchedule, fileInfo, safeFilename, parseAttendeeLines, averageLevel, OVERDUE_DAYS } from "../lib/enablementMath.ts";

const TODAY = "2026-10-15";

test("30 days or more without a session flags a retained client", () => {
  assert.equal(sessionStatus({ retained: true, lastSession: "2026-09-15", since: "2026-01-01", today: TODAY }).due, true);    // exactly 30
  assert.equal(sessionStatus({ retained: true, lastSession: "2026-09-16", since: "2026-01-01", today: TODAY }).due, false);   // 29
  assert.equal(OVERDUE_DAYS, 30);
});

test("clients who aren't retained are never flagged", () => {
  assert.equal(sessionStatus({ retained: false, lastSession: null, since: "2026-01-01", today: TODAY }).due, false);
});

test("no session yet: the clock runs from the service start, and a missing start date still flags", () => {
  assert.equal(sessionStatus({ retained: true, lastSession: null, since: "2026-10-01", today: TODAY }).due, false);
  assert.equal(sessionStatus({ retained: true, lastSession: null, since: "2026-09-01", today: TODAY }).due, true);
  assert.equal(sessionStatus({ retained: true, lastSession: null, since: null, today: TODAY }).due, true);
});

test("a session held today reads as today", () => {
  assert.equal(sessionStatus({ retained: true, lastSession: TODAY, since: null, today: TODAY }).label, "Today");
});

test("monthly schedules clamp to the end of short months and cross year ends", () => {
  assert.equal(plusOneMonth("2026-01-31"), "2026-02-28");
  assert.equal(plusOneMonth("2028-01-31"), "2028-02-29");
  assert.equal(plusOneMonth("2026-12-15"), "2027-01-15");
  assert.equal(nextAfter("weekly", "2026-12-28"), "2027-01-04");
  assert.equal(nextAfter("fortnightly", "2026-10-15"), "2026-10-29");
});

test("advancing a schedule keeps its rhythm and always lands after the session", () => {
  assert.equal(advanceSchedule("weekly", "2026-10-06", "2026-10-06"), "2026-10-13");
  assert.equal(advanceSchedule("weekly", "2026-10-06", "2026-10-08"), "2026-10-13");   // a little late: still the next slot
  assert.equal(advanceSchedule("weekly", "2026-09-01", "2026-10-08"), "2026-10-13");   // very late: skips missed slots
  assert.equal(advanceSchedule("monthly", "2026-10-31", "2026-10-31"), "2026-11-30");
  // held well before the due date: it doesn't use up the next slot
  assert.equal(advanceSchedule("monthly", "2026-11-05", "2026-10-14"), "2026-11-05");
  assert.equal(advanceSchedule("monthly", "2026-11-05", "2026-10-25"), "2026-12-05");   // within half a month: counts for November
  assert.equal(advanceSchedule("monthly", "2026-11-05", "2026-11-04"), "2026-12-05");
  assert.equal(advanceSchedule("weekly", "2026-10-13", "2026-10-12"), "2026-10-20");
  assert.equal(advanceSchedule("fortnightly", "2026-10-20", "2026-10-06"), "2026-10-20");
});

test("only safe file types are accepted, and the type comes from the extension", () => {
  assert.equal(fileInfo("Prompt pack.PDF").contentType, "application/pdf");
  assert.equal(fileInfo("notes.md").ext, "md");
  for (const bad of ["x.html", "x.svg", "x.js", "x.exe", "x.htm", "noext", "x.pdf.html"]) assert.equal(fileInfo(bad), null, bad);
});

test("file names lose paths and odd characters but keep the extension", () => {
  assert.equal(safeFilename("C:\\Users\\me\\Quote: v2?.pdf"), "Quote v2.pdf");
  assert.equal(safeFilename("../../etc/passwd.txt"), "passwd.txt");
  const long = safeFilename("a".repeat(300) + ".docx");
  assert.ok(long.length <= 120 && long.endsWith(".docx"));
});

test("attendee lines become names and roles", () => {
  assert.deepEqual(parseAttendeeLines("Sam Taylor, Office manager\nPriya - Sales\nsam taylor\n\nJo"), [
    { name: "Sam Taylor", role: "Office manager" }, { name: "Priya", role: "Sales" }, { name: "Jo", role: null }]);
  assert.equal(parseAttendeeLines(Array.from({ length: 30 }, (_, i) => `P${i}`).join("\n")).length, 20);
});

test("average skill level ignores unrated staff", () => {
  assert.equal(averageLevel([1, 2, null, 3]), 2);
  assert.equal(averageLevel([null]), null);
  assert.equal(averageLevel([1, 2]), 1.5);
});
