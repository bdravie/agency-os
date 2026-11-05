import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { assetsIn, pendingMigrations, riskyMigration, sessionCookie, tailLines, upSection } from "../../tools/crm-update/rules.mjs";
import { verifyToken } from "../lib/session.ts";

test("reads the migrations still to apply from dbmate's status", () => {
  const out = "[X] 20261112100000_company_research_notes.sql\n[ ] 20261113100000_proposal_loom_recorded.sql\n[ ] 20261114100000_next.sql\n\nApplied: 38\nPending: 2\n";
  assert.deepEqual(pendingMigrations(out), ["20261113100000_proposal_loom_recorded.sql", "20261114100000_next.sql"]);
  assert.deepEqual(pendingMigrations("[X] a.sql\n\nApplied: 1\nPending: 0\n"), []);
});

const up = (body) => `-- migrate:up\n${body}\n-- migrate:down\nDROP TABLE everything;\n`;
test("a change the previous version can live with is not flagged", () => {
  for (const safe of [
    "ALTER TABLE proposals ADD COLUMN loom_recorded_at timestamptz;",
    "ALTER TABLE t ADD COLUMN source text NOT NULL DEFAULT 'manual' CHECK (source IN ('a'));",
    "CREATE TABLE x (id bigserial PRIMARY KEY, name text NOT NULL);",
    "CREATE INDEX i ON t (a);",
    "ALTER TABLE t DROP CONSTRAINT c, ADD CONSTRAINT c CHECK (a > 0);",
    "ALTER TABLE t ALTER COLUMN a DROP NOT NULL;",
    "-- DROP TABLE t; only a comment\nALTER TABLE t ADD COLUMN a int;",
  ]) assert.equal(riskyMigration(up(safe)), null, safe);
});
test("the way down never counts, only the way up", () => {
  assert.ok(!upSection(up("SELECT 1;")).includes("DROP"));
});
test("a change that could break the previous version is flagged", () => {
  for (const risky of [
    "DROP TABLE t;", "ALTER TABLE t DROP COLUMN a;", "ALTER TABLE t DROP a;", "TRUNCATE t;", "DELETE FROM t WHERE a = 1;",
    "ALTER TABLE t RENAME COLUMN a TO b;", "ALTER TABLE t ALTER COLUMN a TYPE bigint;", "ALTER TABLE t ALTER COLUMN a SET NOT NULL;",
    "ALTER TABLE t ADD COLUMN a int NOT NULL;",
  ]) assert.ok(riskyMigration(up(risky)), risky);
});
test("the newest migration in the repo is not flagged", () => {
  const dir = new URL("../../db/migrations/", import.meta.url);
  const newest = readdirSync(dir).filter((f) => f.endsWith(".sql") && !f.startsWith("._")).sort().at(-1);
  assert.equal(riskyMigration(readFileSync(new URL(newest, dir), "utf8")), null);
});

test("finds each script and style a page needs, once", () => {
  const html = `<link href="/_next/static/css/a.css"/><script src="/_next/static/chunks/b.js"></script><script src="/_next/static/chunks/b.js"></script><img src="/_next/static/media/c.png"/>`;
  assert.deepEqual(assetsIn(html), ["/_next/static/css/a.css", "/_next/static/chunks/b.js"]);
  assert.deepEqual(assetsIn("<p>nothing</p>"), []);
});

test("the app accepts the cookie the update command checks pages with", async () => {
  process.env.SESSION_SECRET = "a-test-secret-that-is-long-enough-0123456789";
  const value = sessionCookie(process.env.SESSION_SECRET).split("=")[1];
  assert.equal(await verifyToken(value), true);
  assert.equal(await verifyToken(sessionCookie("a-different-secret-that-is-long-enough-012").split("=")[1]), false);
  assert.equal(await verifyToken(sessionCookie(process.env.SESSION_SECRET, 1000).split("=")[1]), false, "an old one has expired");
});

test("keeps the end of long output", () => {
  assert.equal(tailLines("a\nb\nc\n", 2), "b\nc");
});
