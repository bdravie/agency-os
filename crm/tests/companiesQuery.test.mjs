import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SORTS, buildListQuery } from "../lib/companyFilters.ts";

// The Companies list filters and sorts a temporary table (the "c" block in the page), so they may only use the columns that block selects.
// A column that exists in the companies table but isn't selected there (like trading_name) breaks the whole page.
const src = readFileSync(new URL("../app/companies/page.tsx", import.meta.url), "utf8");
const cte = src.match(/const BASE = `([\s\S]*?)`;/)[1];
const select = cte.slice(cte.indexOf("SELECT") + 6, cte.indexOf("FROM companies co"));
const columns = new Set([...select.matchAll(/\bAS\s+([a-z_0-9]+)/gi)].map((m) => m[1]).concat([...select.matchAll(/\bco\.([a-z_0-9]+)\s*[,\n]/g)].map((m) => m[1])));
const identifiers = (sql) => [...sql.replace(/'[^']*'/g, "").matchAll(/\b([a-z_][a-z_0-9]*)\b/g)].map((m) => m[1]);
const SQL_WORDS = new Set(["lower", "ilike", "or", "and", "not", "null", "desc", "asc", "nulls", "last", "first", "is", "id", "true", "false", "in", "like", "any"]);

test("the search in the page only uses columns the list query selects", () => {
  const clause = src.match(/AND (\(\$1 = '' OR[^\n]*?\)) AND \(\$2/)[1];
  for (const id of identifiers(clause)) if (!/^\d+$/.test(id) && !SQL_WORDS.has(id.toLowerCase())) assert.ok(columns.has(id), `search uses "${id}", which the list query does not select`);
});
test("every sort order only uses columns the list query selects", () => {
  for (const s of SORTS) {
    const { order } = buildListQuery({ sort: s.key }, 4);
    for (const id of identifiers(order)) if (!SQL_WORDS.has(id.toLowerCase())) assert.ok(columns.has(id), `sort "${s.key}" uses "${id}", which the list query does not select`);
  }
});
