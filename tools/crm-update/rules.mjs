// Pure helpers for the CRM update command (no files, no network), so they can be tested on their own.
import { createHmac } from "node:crypto";

/** The files dbmate lists as not yet applied, from the output of `dbmate status`. */
export const pendingMigrations = (statusOutput) =>
  statusOutput.split("\n").map((l) => l.match(/^\[ \]\s+(\S+\.sql)/)?.[1]).filter(Boolean);

/** Only what a migration does on the way up, without comments. */
export function upSection(sql) {
  const start = sql.indexOf("-- migrate:up");
  const end = sql.indexOf("-- migrate:down");
  const up = sql.slice(start < 0 ? 0 : start, end < 0 ? undefined : end);
  return up.replace(/--.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
}

const RISKY = [
  [/\bDROP\s+(TABLE|COLUMN|TYPE|SCHEMA)\b/i, "removes a table, column or type"],
  [/\bALTER\s+TABLE\b[^;]*\bDROP\s+(?!CONSTRAINT\b|NOT\s+NULL\b|DEFAULT\b)\w/i, "removes a column"],
  [/\bTRUNCATE\b/i, "empties a table"],
  [/\bDELETE\s+FROM\b/i, "deletes rows"],
  [/\bRENAME\b/i, "renames something the running version may still use"],
  [/\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i, "changes a column's type"],
  [/\bALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL\b/i, "makes a column required"],
  [/\bADD\s+COLUMN\s+(?:(?!,|;)[\s\S])*?\bNOT\s+NULL\b(?!(?:(?!,|;)[\s\S])*?\bDEFAULT\b)/i, "adds a required column with no default"],
];

/**
 * Why a migration would stop the previous version of the CRM working, or null. Going back to the previous version restores the code, not the database,
 * so a change the old code cannot live with has to be run deliberately.
 */
export function riskyMigration(sql) {
  const up = upSection(sql);
  return RISKY.find(([pattern]) => pattern.test(up))?.[1] ?? null;
}

/** The scripts and styles a page needs. If any of these cannot be fetched, the page's buttons and live numbers stop working. */
export const assetsIn = (html) =>
  [...new Set(html.match(/\/_next\/static\/[^"'\s\\]+\.(?:js|css)/g) ?? [])];

/** A signed-in cookie for checking pages, made the same way as crm/lib/session.ts. A test checks that the app accepts it. */
export function sessionCookie(secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const expires = String(nowSeconds + 600);
  return `agency_session=${expires}.${createHmac("sha256", secret).update(expires).digest("hex")}`;
}

/** The end of a long command's output, which is where the reason it failed is. */
export const tailLines = (text, n = 30) => text.trim().split("\n").slice(-n).join("\n");
