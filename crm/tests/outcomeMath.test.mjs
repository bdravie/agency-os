import test from "node:test";
import assert from "node:assert/strict";
import { improvement, verdict, parsePeriod, assess, readingsFromCsv, unverifiedNumbers, movedText, monthEnd, addMonths } from "../lib/outcomeMath.ts";
import { parseCsv } from "../lib/csv.ts";

const m = (id, name, better, baseline, readings, unit = "") => ({ id, name, unit, better, baseline, readings });
const TODAY = "2026-11-20";

test("improvement is positive when the number moves the good way", () => {
  assert.equal(improvement(20, 10, "lower"), 0.5);
  assert.equal(improvement(20, 30, "lower"), -0.5);
  assert.equal(improvement(10, 15, "higher"), 0.5);
  assert.equal(improvement(10, 10, "higher"), 0);
});

test("a zero baseline gives a clear good or bad result, never NaN or Infinity", () => {
  assert.equal(improvement(0, 5, "higher"), 1);
  assert.equal(improvement(0, 5, "lower"), -1);
  assert.equal(improvement(0, 0, "lower"), 0);
  assert.equal(movedText(0, 5), "from 0 to 5");
});

test("verdict uses a 10% band either way", () => {
  assert.equal(verdict(0.09), "flat");
  assert.equal(verdict(0.1), "better");
  assert.equal(verdict(-0.1), "worse");
  assert.equal(verdict(-0.05), "flat");
});

test("months are read in several formats, UK day order", () => {
  assert.equal(parsePeriod("2026-10"), "2026-10-01");
  assert.equal(parsePeriod("2026-10-15"), "2026-10-01");
  assert.equal(parsePeriod("10/2026"), "2026-10-01");
  assert.equal(parsePeriod("03/11/2026"), "2026-11-01");
  assert.equal(parsePeriod("Oct 2026"), "2026-10-01");
  assert.equal(parsePeriod("September 2026"), "2026-09-01");
  assert.equal(parsePeriod("2026-13"), null);
  assert.equal(parsePeriod("soon"), null);
});

test("month helpers handle year ends and leap years", () => {
  assert.equal(addMonths("2026-12-01", 1), "2027-01-01");
  assert.equal(addMonths("2026-01-01", -1), "2025-12-01");
  assert.equal(monthEnd("2028-02-10"), "2028-02-29");
});

test("flat results are flagged once past the early window", () => {
  const a = assess({ kickoff: "2026-09-01", today: TODAY, metrics: [m(1, "Missed calls per week", "lower", 20, [{ period: "2026-10-01", value: 19 }]), m(2, "Bookings per month", "higher", 10, [{ period: "2026-10-01", value: 10 }])] });
  assert.equal(a.state, "flat"); assert.equal(a.flagged, true);
});

test("clear improvement is not flagged", () => {
  const a = assess({ kickoff: "2026-09-01", today: TODAY, metrics: [m(1, "Missed calls per week", "lower", 20, [{ period: "2026-10-01", value: 8 }]), m(2, "Bookings per month", "higher", 10, [{ period: "2026-10-01", value: 10 }])] });
  assert.equal(a.state, "improving"); assert.equal(a.flagged, false); assert.equal(a.counts.better, 1);
});

test("slipping is flagged and mixed is not", () => {
  const worse = m(1, "Response time", "lower", 10, [{ period: "2026-10-01", value: 15 }]);
  assert.equal(assess({ kickoff: "2026-09-01", today: TODAY, metrics: [worse] }).state, "slipping");
  const good = m(2, "Leads per month", "higher", 10, [{ period: "2026-10-01", value: 20 }]);
  const mixed = assess({ kickoff: "2026-09-01", today: TODAY, metrics: [worse, good] });
  assert.equal(mixed.state, "mixed"); assert.equal(mixed.flagged, false);
});

test("too early, no data and stale", () => {
  const base = [m(1, "Leads per month", "higher", 10, [])];
  assert.equal(assess({ kickoff: "2026-11-01", today: TODAY, metrics: base }).state, "early");
  assert.equal(assess({ kickoff: "2026-09-01", today: TODAY, metrics: base }).state, "no_data");
  assert.equal(assess({ kickoff: "2026-09-01", today: TODAY, metrics: base }).flagged, true);
  const old = [m(1, "Leads per month", "higher", 10, [{ period: "2026-08-01", value: 20 }])];
  assert.equal(assess({ kickoff: "2026-06-01", today: TODAY, metrics: old }).state, "stale");
  assert.equal(assess({ kickoff: "2026-11-01", today: TODAY, metrics: [] }).state, "early");
});

test("the next month to log is the last finished month", () => {
  const a = assess({ kickoff: "2026-09-01", today: TODAY, metrics: [m(1, "Leads", "higher", 10, [{ period: "2026-09-01", value: 12 }])] });
  assert.equal(a.dueMonth, "2026-10-01");
  const b = assess({ kickoff: "2026-09-01", today: TODAY, metrics: [m(1, "Leads", "higher", 10, [{ period: "2026-10-01", value: 12 }])] });
  assert.equal(b.dueMonth, null);
});

test("case study needs 60 days of data and a real improvement", () => {
  const rs = (p, v) => [m(1, "Missed calls", "lower", 20, [{ period: p, value: v }])];
  assert.equal(assess({ kickoff: "2026-10-01", today: TODAY, metrics: rs("2026-10-01", 5) }).caseStudy.ready, false);   // 30 days of data
  const ok = assess({ kickoff: "2026-09-01", today: TODAY, metrics: rs("2026-10-01", 5) });                            // to 31 Oct = 60 days
  assert.equal(ok.dataDays, 60); assert.equal(ok.caseStudy.ready, true);
  const flat = assess({ kickoff: "2026-09-01", today: TODAY, metrics: rs("2026-10-01", 19) });
  assert.equal(flat.caseStudy.ready, false); assert.match(flat.caseStudy.reason, /honest/);
});

test("data for the current month only counts up to today", () => {
  const a = assess({ kickoff: "2026-10-01", today: "2026-11-10", metrics: [m(1, "Leads", "higher", 10, [{ period: "2026-11-01", value: 30 }])] });
  assert.equal(a.dataDays, 40);
});

test("figures in drafted text must come from the facts", () => {
  const facts = "Missed calls per week: 20 before, 8 now (-60%). Cost £1,200. October 2026.";
  assert.deepEqual(unverifiedNumbers("Missed calls fell from 20 to 8, down 60% in October 2026.", facts), []);
  assert.deepEqual(unverifiedNumbers("That saved 15 hours and £1,200.", facts), ["15"]);
});

test("numbered list markers are not treated as invented figures", () => {
  assert.deepEqual(unverifiedNumbers("Prompts:\n1. What was the problem?\n2. What changed?\n3) Would you recommend us?", "Missed calls 20"), []);
});

const metrics = [{ id: 1, name: "Missed calls per week" }, { id: 2, name: "Bookings per month" }];
test("CSV: wide format with several months", () => {
  const r = readingsFromCsv(parseCsv("month,Missed calls per week,Bookings per month\n2026-09,15,12\nOct 2026,9,\n"), metrics, TODAY);
  assert.deepEqual(r.problems, []);
  assert.equal(r.readings.length, 3);
  assert.deepEqual(r.readings.find((x) => x.metricId === 1 && x.period === "2026-10-01"), { period: "2026-10-01", metricId: 1, value: 9 });
});

test("CSV: long format, tolerant of case, symbols and BOM", () => {
  const r = readingsFromCsv(parseCsv("﻿Month,Metric,Value\n2026-10,missed calls PER week,\"1,5\"\n2026-10,Bookings per month,12%\n"), metrics, TODAY);
  assert.deepEqual(r.readings.map((x) => x.value).sort((a, b) => a - b), [12, 15]);   // "1,5" is one quoted cell; thousands commas are stripped
});

test("CSV: bad rows are reported, good rows still import, later rows win", () => {
  const r = readingsFromCsv(parseCsv("month,metric,value\n2026-10,Nope,3\n2027-05,Bookings per month,3\nsoon,Bookings per month,3\n2026-10,Bookings per month,abc\n2026-10,Bookings per month,7\n2026-10,Bookings per month,8\n"), metrics, TODAY);
  assert.equal(r.problems.length, 4);
  assert.equal(r.readings.length, 1); assert.equal(r.readings[0].value, 8);
});

test("CSV: unusable files give a clear message", () => {
  assert.match(readingsFromCsv(parseCsv("a,b\n1,2\n"), metrics, TODAY).problems[0], /month/);
  assert.match(readingsFromCsv(parseCsv("month,Other\n2026-10,3\n"), metrics, TODAY).problems.join(" "), /match/);
  assert.match(readingsFromCsv([["month"]], metrics, TODAY).problems[0], /header/);
});
