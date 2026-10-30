import test from "node:test";
import assert from "node:assert/strict";
import { activityTarget as t } from "../lib/activityTarget.ts";

test("company page: each activity points at the section it changed", () => {
  assert.deepEqual(t({ type: "contact_added", contact_id: 15 }, "company"), { id: "contact-15", fallback: "contacts" });
  assert.deepEqual(t({ type: "contact_added" }, "company"), { id: "contacts", fallback: "contacts" });
  assert.deepEqual(t({ type: "rapport_found", contact_id: 15 }, "company"), { id: "contact-15", fallback: "contacts" });
  assert.deepEqual(t({ type: "stage_changed", deal_id: 3 }, "company"), { id: "deal-3", fallback: "deals" });
  assert.deepEqual(t({ type: "contact_details_updated" }, "company"), { id: "website" });
  assert.deepEqual(t({ type: "ch_health_run" }, "company"), { id: "filings" });
  assert.deepEqual(t({ type: "email_logged" }, "company"), { id: "outreach" });
  assert.deepEqual(t({ type: "offer_suggested" }, "company"), { id: "offer" });
  assert.deepEqual(t({ type: "opted_out" }, "company"), { id: "compliance" });
  assert.deepEqual(t({ type: "lead_added" }, "company"), { id: "top" });
  assert.deepEqual(t({ type: "deal_deleted" }, "company"), { href: "/deals/deleted" });
  assert.deepEqual(t({ type: "proposal_drafted" }, "company"), { href: "/proposals" });
});
test("an unknown type still goes somewhere useful, and backups have nowhere to go", () => {
  assert.deepEqual(t({ type: "something_new" }, "company"), { id: "top" });
  assert.equal(t({ type: "backup_completed" }, "company"), null);
  assert.equal(t({ type: "backup_completed" }, "feed"), null);
});
test("deal page and side panel", () => {
  assert.deepEqual(t({ type: "stage_changed" }, "deal"), { id: "stage" });
  assert.deepEqual(t({ type: "quote_created" }, "deal"), { id: "quotes" });
  assert.deepEqual(t({ type: "mystery" }, "deal"), { id: "top" });
  assert.deepEqual(t({ type: "deal_offer_added" }, "drawer"), { id: "dr-offers" });
  assert.equal(t({ type: "mystery" }, "drawer"), null);
});
test("dashboard feed links to the right page and section", () => {
  assert.deepEqual(t({ type: "stage_changed", deal_id: 7, company_id: 2 }, "feed"), { href: "/deals/7#stage" });
  assert.deepEqual(t({ type: "contact_added", company_id: 140, contact_id: 15 }, "feed"), { href: "/companies/140#contact-15" });
  assert.deepEqual(t({ type: "ch_health_run", company_id: 5 }, "feed"), { href: "/companies/5#filings" });
  assert.deepEqual(t({ type: "proposal_drafted" }, "feed"), { href: "/proposals" });
  assert.equal(t({ type: "something_new" }, "feed"), null);
  assert.deepEqual(t({ type: "deal_deleted" }, "feed"), { href: "/deals/deleted" });
  assert.deepEqual(t({ type: "proposal_drafted", company_id: 5 }, "feed"), { href: "/proposals" });
});
