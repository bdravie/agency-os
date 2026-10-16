-- migrate:up

-- 1. Offers become products: a billing type, a price range, a default duration and a deliverables checklist.
--    Existing rows keep NULL / defaults (billing NULL = an older niche package priced as setup + monthly).
ALTER TABLE offers
  ADD COLUMN billing               text,
  ADD COLUMN price_min_gbp         numeric(10,2),
  ADD COLUMN price_max_gbp         numeric(10,2),
  ADD COLUMN default_duration_days integer,
  ADD COLUMN deliverables          jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN sort_order            integer NOT NULL DEFAULT 100,
  ADD CONSTRAINT offers_billing_chk CHECK (billing IS NULL OR billing IN ('one_off', 'setup', 'monthly')),
  ADD CONSTRAINT offers_price_range_chk CHECK (price_min_gbp IS NULL OR price_max_gbp IS NULL OR price_min_gbp <= price_max_gbp),
  ADD CONSTRAINT offers_duration_chk CHECK (default_duration_days IS NULL OR default_duration_days > 0);

-- 2. A deal carries one or more offers. Each line has its own agreed price, a checklist copied from the offer
--    (so ticking items off on one deal never changes the offer), and optionally a credit from an earlier line
--    (for example an audit fee credited against the build).
CREATE TABLE deal_offers (
  id              bigserial PRIMARY KEY,
  deal_id         bigint NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  offer_id        bigint NOT NULL REFERENCES offers(id) ON DELETE RESTRICT,
  billing         text NOT NULL CHECK (billing IN ('one_off', 'setup', 'monthly')),   -- copied from the offer at link time
  price_gbp       numeric(10,2) NOT NULL CHECK (price_gbp >= 0),                      -- one-off/setup fee, or the monthly fee
  credit_from_id  bigint REFERENCES deal_offers(id) ON DELETE SET NULL,
  credit_gbp      numeric(10,2) NOT NULL DEFAULT 0 CHECK (credit_gbp >= 0),
  duration_days   integer CHECK (duration_days IS NULL OR duration_days > 0),
  status          text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'delivered')),
  checklist       jsonb NOT NULL DEFAULT '[]',                                        -- [{"text": "...", "done": false}]
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_offers_credit_le_price CHECK (credit_gbp <= price_gbp),
  CONSTRAINT deal_offers_no_monthly_credit CHECK (billing <> 'monthly' OR credit_gbp = 0),
  CONSTRAINT deal_offers_no_self_credit CHECK (credit_from_id IS NULL OR credit_from_id <> id)
);
CREATE INDEX deal_offers_deal_idx ON deal_offers (deal_id);

-- 3. Clients created from a deal remember which deal, so marking a deal Won never creates the same client twice.
ALTER TABLE client_services ADD COLUMN deal_id bigint REFERENCES deals(id) ON DELETE SET NULL;
CREATE INDEX client_services_deal_idx ON client_services (deal_id);

-- migrate:down
DROP INDEX client_services_deal_idx;
ALTER TABLE client_services DROP COLUMN deal_id;
DROP TABLE deal_offers;
ALTER TABLE offers DROP CONSTRAINT offers_duration_chk, DROP CONSTRAINT offers_price_range_chk, DROP CONSTRAINT offers_billing_chk,
  DROP COLUMN sort_order, DROP COLUMN deliverables, DROP COLUMN default_duration_days, DROP COLUMN price_max_gbp, DROP COLUMN price_min_gbp, DROP COLUMN billing;
