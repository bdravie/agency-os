-- migrate:up

-- The Offers page leads with three offers: one entry level, one mid-tier, one premium. An offer holds at most one tier and a tier
-- has at most one offer. Nullable, so the previous version of the CRM (which does not know the column) keeps working.
ALTER TABLE offers ADD COLUMN tier text CONSTRAINT offers_tier_known CHECK (tier IN ('entry', 'mid', 'premium'));
CREATE UNIQUE INDEX offers_tier_unique ON offers (tier) WHERE tier IS NOT NULL;

-- The premium offer is a package of three existing services (owner's decision, 11 Nov 2026). Added only if it is not there,
-- and linked only to services that exist, so on an empty database this does nothing and the seeder does it instead.
INSERT INTO offers (name, niche, outcome, is_bundle, sort_order)
SELECT 'Build, Train & Optimise', 'any', 'The system built, your team trained to use it, and improvements every month after that', true, 3
 WHERE EXISTS (SELECT 1 FROM offers WHERE name = 'Build' AND NOT is_bundle)
ON CONFLICT (name) DO NOTHING;

INSERT INTO offer_components (bundle_id, component_id)
SELECT b.id, s.id
  FROM offers b JOIN offers s ON s.name IN ('Build', 'Team Enablement', 'Optimise Retainer') AND NOT s.is_bundle AND s.billing IS NOT NULL
 WHERE b.name = 'Build, Train & Optimise' AND b.is_bundle
   AND NOT EXISTS (SELECT 1 FROM offer_components WHERE bundle_id = b.id);

UPDATE offers SET tier = 'entry'   WHERE name = 'AI Opportunity Audit' AND billing IS NOT NULL AND NOT is_bundle;
UPDATE offers SET tier = 'mid'     WHERE name = 'Build' AND billing IS NOT NULL AND NOT is_bundle;
UPDATE offers SET tier = 'premium' WHERE name = 'Build, Train & Optimise' AND is_bundle;

-- migrate:down
DROP INDEX offers_tier_unique;
ALTER TABLE offers DROP COLUMN tier;
