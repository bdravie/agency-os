import test from "node:test";
import assert from "node:assert/strict";
import { deletionProblem, deletionLabel } from "../lib/dealDeletion.ts";

test("a category and a real note are both required", () => {
  assert.equal(deletionProblem("admin_mistake", "Duplicate of the Oakwood deal"), null);
  assert.equal(deletionProblem("wasted_lead", "  Never replied after three tries  "), null);
  assert.match(deletionProblem("", "Duplicate of the Oakwood deal") ?? "", /Choose why/);
  assert.match(deletionProblem("lost", "Duplicate of the Oakwood deal") ?? "", /Choose why/);
  assert.match(deletionProblem("admin_mistake", "oops") ?? "", /at least 10/);
  assert.match(deletionProblem("admin_mistake", "          ") ?? "", /at least 10/);
  assert.match(deletionProblem("admin_mistake", null) ?? "", /at least 10/);
  assert.match(deletionProblem("admin_mistake", "x".repeat(501)) ?? "", /under 500/);
});
test("labels are friendly", () => assert.equal(deletionLabel("wasted_lead"), "Wasted lead"));
