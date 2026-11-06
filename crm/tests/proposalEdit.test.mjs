import test from "node:test";
import assert from "node:assert/strict";
import { cleanDetails } from "../lib/proposalEdit.ts";

const JOB = "We need a weekly report built from our job totals and emailed on Mondays.";
const ok = (raw) => { const r = cleanDetails(raw); assert.ok(r.ok, r.ok ? "" : r.error); return r.value; };
const bad = (raw) => { const r = cleanDetails(raw); assert.ok(!r.ok); return r.error; };

test("tidy values are saved and blanks become nothing", () => {
  assert.deepEqual(ok({ job_title: "  Weekly   report ", company_name: "", job_url: "", job_text: ` ${JOB} ` }), { job_title: "Weekly report", company_name: null, job_url: null, job_text: JOB });
});
test("the Upwork link must be https", () => {
  assert.equal(ok({ job_url: "https://www.upwork.com/jobs/~01abc", job_text: JOB }).job_url, "https://www.upwork.com/jobs/~01abc");
  assert.match(bad({ job_url: "http://www.upwork.com/jobs/1", job_text: JOB }), /https/);
  assert.match(bad({ job_url: "javascript:alert(1)", job_text: JOB }), /https/);
  assert.match(bad({ job_url: "not a link", job_text: JOB }), /web address/);
});
test("the job post must still be a real job post", () => {
  assert.match(bad({ job_text: "too short" }), /few sentences/);
  assert.match(bad({ job_text: "x".repeat(20001) }), /too long/);
});
test("long names are refused", () => {
  assert.match(bad({ job_title: "x".repeat(201), job_text: JOB }), /job title/);
  assert.match(bad({ company_name: "x".repeat(121), job_text: JOB }), /company/);
});
