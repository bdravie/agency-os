-- migrate:up

-- Niche status (docs/NICHE_FOCUS_PLAN.md, N1). A niche added in the CRM gets the same shape as one in config/niches.yaml:
-- status (what the CRM lets you do with it), tier, the outreach channels it may use, the content platforms it posts to,
-- a one-line promise and its pain points. Rules for reading them live in crm/lib/nicheStatus.ts.
-- Niche status is an extra gate on top of lead_gate, never a replacement: lead_gate is not changed here.
-- Existing rows become parked (the safest status): nothing is deleted, and their companies keep their niche and history.
-- Additive only, so the previous version of the CRM keeps working.

ALTER TABLE custom_niches
  ADD COLUMN status      text   NOT NULL DEFAULT 'parked' CHECK (status IN ('active', 'seeding', 'audience', 'parked')),
  ADD COLUMN tier        text   CHECK (tier IS NULL OR tier IN ('low', 'mid', 'high')),
  ADD COLUMN channels    text[] NOT NULL DEFAULT '{}' CHECK (channels <@ ARRAY['email', 'linkedin', 'instagram_dm']::text[]),
  ADD COLUMN platforms   text[] NOT NULL DEFAULT '{}' CHECK (platforms <@ ARRAY['linkedin', 'instagram', 'tiktok']::text[]),
  ADD COLUMN promise     text   CHECK (promise IS NULL OR length(promise) <= 300),
  ADD COLUMN pain_points text[] NOT NULL DEFAULT '{}' CHECK (cardinality(pain_points) <= 10);

-- migrate:down
ALTER TABLE custom_niches
  DROP COLUMN pain_points,
  DROP COLUMN promise,
  DROP COLUMN platforms,
  DROP COLUMN channels,
  DROP COLUMN tier,
  DROP COLUMN status;
