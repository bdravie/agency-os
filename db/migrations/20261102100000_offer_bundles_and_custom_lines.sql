-- migrate:up

-- 1. A package is an offer that is made of other offers (services). Adding a package to a deal adds one line per service.
ALTER TABLE offers ADD COLUMN is_bundle boolean NOT NULL DEFAULT false;

CREATE TABLE offer_components (
  id            bigserial PRIMARY KEY,
  bundle_id     bigint NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  component_id  bigint NOT NULL REFERENCES offers(id) ON DELETE RESTRICT,
  CONSTRAINT offer_components_unique UNIQUE (bundle_id, component_id),
  CONSTRAINT offer_components_not_self CHECK (bundle_id <> component_id)
);
CREATE INDEX offer_components_bundle_idx ON offer_components (bundle_id);

-- 2. A deal line can be a custom service (no catalogue offer, just a name and a price),
--    and remembers which package it came from so the deal page can group them.
ALTER TABLE deal_offers
  ALTER COLUMN offer_id DROP NOT NULL,
  ADD COLUMN custom_name text,
  ADD COLUMN bundle_name text,
  ADD CONSTRAINT deal_offers_named CHECK (offer_id IS NOT NULL OR (custom_name IS NOT NULL AND btrim(custom_name) <> ''));

-- migrate:down
ALTER TABLE deal_offers DROP CONSTRAINT deal_offers_named, DROP COLUMN bundle_name, DROP COLUMN custom_name;
DELETE FROM deal_offers WHERE offer_id IS NULL;
ALTER TABLE deal_offers ALTER COLUMN offer_id SET NOT NULL;
DROP TABLE offer_components;
ALTER TABLE offers DROP COLUMN is_bundle;
