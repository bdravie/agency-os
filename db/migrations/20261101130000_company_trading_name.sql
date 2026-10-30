-- migrate:up

-- Many small firms trade under a different name from the one they are registered under (or have been renamed since the register was updated).
-- name stays the legal name (Companies House, compliance, signatures). trading_name is what the firm calls itself today.
-- display_name is the one searches, research and drafts use: the trading name when there is one, otherwise the legal name.
ALTER TABLE companies ADD COLUMN trading_name text;
ALTER TABLE companies ADD COLUMN display_name text GENERATED ALWAYS AS (COALESCE(NULLIF(btrim(trading_name), ''), name)) STORED;
CREATE INDEX companies_display_name_idx ON companies (lower(display_name));

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
