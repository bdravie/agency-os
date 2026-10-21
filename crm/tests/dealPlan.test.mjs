import test from "node:test";
import assert from "node:assert/strict";
import { contactRoutes, buildPlan, planTasks } from "../lib/dealPlan.ts";

const base = { sendable: true, generic_email: "info@acme.co.uk", instagram_url: "https://instagram.com/acme", linkedin_url: null, facebook_url: null, contact_url: null, phone: "07700 900123", contacts: [] };
const S = { title: "Missed-call text-back", automation: "Text back missed calls.", outcome: "Fewer lost enquiries", why: "No booking form.", finding_ids: ["F1"], offer_name: "Missed Call Rescue", kpi: "Enquiries a week", pilot: "Two-week trial", risk: "Needs consent wording", needs_dpa: true, confidence: "high" };

test("a company that may not be contacted has no route and no tasks", () => {
  assert.deepEqual(contactRoutes({ ...base, sendable: false }), []);
  assert.deepEqual(planTasks([]), []);
});
test("named decision-makers come first, opted-out ones never, then inbox, Instagram, phone", () => {
  const r = contactRoutes({ ...base, contacts: [{ id: 1, name: "Sam Taylor", role: "Owner", email: "sam@acme.co.uk", opted_out: true }, { id: 2, name: "Jo Lee", role: "Director", email: "jo@acme.co.uk", opted_out: false }] });
  assert.deepEqual(r.map((x) => x.kind), ["named_email", "generic_email", "instagram", "phone"]);
  assert.equal(r[0].contactId, 2); assert.equal(r[0].channel, "email"); assert.equal(r[2].channel, "social_dm"); assert.equal(r[3].channel, null);
});
test("with no email the first route is Instagram, and the plan names it with fallbacks", () => {
  const routes = contactRoutes({ ...base, generic_email: null });
  const plan = buildPlan({ companyName: "Acme", suggestion: S, findingTitles: ["No booking form"], opener: null, questions: ["How do you take bookings?"], routes, date: "21 Oct 2026" });
  assert.match(plan, /BEST WAY TO CONTACT THEM\nInstagram DM/); assert.match(plan, /Fallbacks: Phone/); assert.match(plan, /Instagram DM draft/);
  assert.match(plan, /data processing agreement/); assert.match(plan, /How do you take bookings/);
});
test("a blocked company's plan says not to contact them", () => {
  const plan = buildPlan({ companyName: "Acme", suggestion: S, findingTitles: [], opener: null, questions: [], routes: [], blockedReason: "Not verified.", date: "d" });
  assert.match(plan, /Don't contact them yet. Not verified./); assert.match(plan, /guess/);
});
test("tasks are the first contact and a follow-up", () => {
  const t = planTasks(contactRoutes(base));
  assert.equal(t.length, 2); assert.match(t[0].title, /^First contact/); assert.match(t[1].title, /^Follow-up/);
});
