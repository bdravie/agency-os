import test from "node:test";
import assert from "node:assert/strict";
import { outreachDrafts } from "../lib/outreach.ts";

test("with a decision-maker the greeting uses their first name; without one it greets the company", async () => {
  const person = await outreachDrafts("Example Dental Ltd", { firstName: "Alex", niche: "dental" });
  for (const k of ["first", "followUp", "social"]) assert.match(person[k].body, /^Hi Alex,/);
  const company = await outreachDrafts("Example Dental Ltd", { niche: "dental" });
  assert.match(company.first.body, /^Hi Example Dental team,/);
});
test("each niche gets its own wording, and an unknown or unsafe niche falls back to the default", async () => {
  const dental = await outreachDrafts("X Ltd", { niche: "dental" });
  const roofing = await outreachDrafts("X Ltd", { niche: "Roofing" });
  assert.equal(dental.template, "dental"); assert.equal(roofing.template, "roofing");
  assert.match(dental.first.body, /patient details/); assert.match(roofing.first.body, /before and after photos/);
  for (const niche of ["nonexistent_niche", "../../.env", "", null, undefined]) {
    const d = await outreachDrafts("X Ltd", { niche });
    assert.equal(d.template, null);
    assert.match(d.first.body, /weekly ad reports/);
  }
});
test("no draft keeps a legacy or unfilled company placeholder", async () => {
  for (const niche of ["hvac", "dental", "marketing_agencies", "estate_agent"]) {
    const d = await outreachDrafts("Example Ltd", { niche });
    for (const k of ["first", "followUp", "social"]) assert.ok(!/\{\{(company|agency)\}\}/.test(d[k].body + d[k].subject), `${niche} ${k}`);
  }
});
