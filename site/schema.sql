-- Cloudflare D1 schema for the public site's split tests. Anonymous counts only: one row per day, test, version and event type.
CREATE TABLE IF NOT EXISTS events (
  day        TEXT NOT NULL,      -- UK date, YYYY-MM-DD
  experiment TEXT NOT NULL,
  variant    TEXT NOT NULL,
  type       TEXT NOT NULL,      -- view | cta_click | scroll_75 | booked
  n          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, experiment, variant, type)
);
