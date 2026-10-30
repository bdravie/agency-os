import test from "node:test";
import assert from "node:assert/strict";
import { proposalName, titleFromJob } from "../lib/proposalName.ts";

test("title and company are joined, either alone is used, and there is always a name", () => {
  assert.equal(proposalName({ id: 1, job_title: "Receipt extraction", company_name: "Acme Ltd" }), "Receipt extraction · Acme Ltd");
  assert.equal(proposalName({ id: 1, job_title: " Receipt  extraction ", company_name: null }), "Receipt extraction");
  assert.equal(proposalName({ id: 1, job_title: null, company_name: "Acme Ltd" }), "Acme Ltd");
  assert.equal(proposalName({ id: 7, job_title: "", company_name: "" }), "Proposal #7");
});
test("the title comes from the first real line of the job post", () => {
  assert.equal(titleFromJob("\n  \nUpwork Job Posting: GoHighLevel (GHL) AI Voice & Automation Expert\nWe are looking"), "GoHighLevel (GHL) AI Voice & Automation Expert");
  assert.equal(titleFromJob("Summary\nBuild a receipt reader\nMore"), "Build a receipt reader");
  assert.equal(titleFromJob("x".repeat(200))?.length, 88);
  assert.equal(titleFromJob("  \n "), null);
});
