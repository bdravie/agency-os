import test from "node:test";
import assert from "node:assert/strict";
import { outreachDrafts } from "../lib/outreach.ts";

test("with a decision-maker the greeting uses their first name; without one it greets the company", async () => {
  const person = await outreachDrafts("Example Dental Ltd", { firstName: "Alex" });
  assert.match(person.first.body, /^Hi Alex,/);
  assert.match(person.followUp.body, /^Hi Alex,/);
  assert.match(person.social.body, /^Hi Alex,/);
  const company = await outreachDrafts("Example Dental Ltd");
  assert.match(company.first.body, /^Hi Example Dental team,/);
});
