-- migrate:up

-- Niche status as a database backstop (docs/NICHE_FOCUS_PLAN.md, N2). The app checks a company's niche before any draft, send or logged send
-- (crm/lib/nicheGate.ts); this makes the database refuse a logged send that skips the app. It is an extra gate on top of lead_gate and
-- contact_gate, which are unchanged.

-- 1. The statuses of the niches in config/niches.yaml, so the database can read them. The CRM writes this table from the yaml
--    (syncNicheRules, before every niche check), so the yaml stays the one place they are set; niches added in the CRM keep theirs in custom_niches.
--    Seeded here with the values in config/niches.yaml on 14 Nov 2026 so the guard works before the CRM first syncs.
CREATE TABLE niche_rules (
  key        text PRIMARY KEY,
  status     text   NOT NULL CHECK (status IN ('active', 'seeding', 'audience', 'parked')),
  channels   text[] NOT NULL DEFAULT '{}' CHECK (channels <@ ARRAY['email', 'linkedin', 'instagram_dm']::text[]),
  synced_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO niche_rules (key, status, channels) VALUES
  ('dental', 'active', '{email,linkedin}'),
  ('aesthetics', 'active', '{email,linkedin,instagram_dm}'),
  ('beauty', 'audience', '{}'),
  ('property_developers', 'seeding', '{linkedin}'),
  ('peptide_clinics', 'parked', '{}'),
  ('hvac', 'parked', '{}'), ('roofing', 'parked', '{}'), ('pest_control', 'parked', '{}'),
  ('marketing_agencies', 'parked', '{}'), ('ecommerce', 'parked', '{}'), ('creators', 'parked', '{}'), ('trades', 'parked', '{}');

-- 2. The same rule as canOutreach / sendBlock in crm/lib/nicheStatus.ts. The yaml (niche_rules) wins over a custom niche with the same key.
--    p_channel 'email' / 'linkedin' / 'instagram_dm' needs that channel (seeding: linkedin only); NULL means "any message", which needs an active niche.
--    An unknown niche, or none, counts as parked.
CREATE FUNCTION niche_allows(p_niche text, p_channel text) RETURNS boolean LANGUAGE sql STABLE AS $$
  WITH n AS (
    SELECT status, channels, 1 AS pri FROM niche_rules WHERE key = p_niche
    UNION ALL
    SELECT status, channels, 2 FROM custom_niches WHERE key = p_niche
    ORDER BY pri LIMIT 1
  )
  SELECT COALESCE((
    SELECT CASE
      WHEN p_channel IS NULL THEN status = 'active'
      WHEN status = 'active' THEN p_channel = ANY (channels)
      WHEN status = 'seeding' THEN p_channel = 'linkedin' AND p_channel = ANY (channels)
      ELSE false END
    FROM n), false)
$$;

-- 3. The send guard: LinkedIn notes are now gated like other sends, and every logged send also needs the company's niche to allow it.
CREATE OR REPLACE FUNCTION guard_send_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_niche text;
  v_channel text;
BEGIN
  IF NEW.type IN ('email_logged', 'dm_logged', 'sms_logged', 'linkedin_note_logged') THEN
    IF NEW.company_id IS NOT NULL AND NOT COALESCE((SELECT sendable FROM lead_gate WHERE company_id = NEW.company_id), false) THEN
      RAISE EXCEPTION 'Blocked: this lead is not an eligible active limited company, has opted out, or is on the suppression list.';
    END IF;
    IF NEW.contact_id IS NOT NULL AND COALESCE((SELECT blocked_person FROM contact_gate WHERE contact_id = NEW.contact_id), false) THEN
      RAISE EXCEPTION 'Blocked: this person has opted out or is on the suppression list.';
    END IF;
    IF NEW.company_id IS NOT NULL THEN
      v_channel := CASE NEW.type WHEN 'email_logged' THEN 'email' WHEN 'linkedin_note_logged' THEN 'linkedin' ELSE NULL END;
      SELECT niche INTO v_niche FROM companies WHERE id = NEW.company_id;
      IF NOT niche_allows(v_niche, v_channel) THEN
        RAISE EXCEPTION 'Blocked: this company''s niche (%) does not allow this. Only active niches are contacted, and a seeding niche only by LinkedIn note.', COALESCE(v_niche, 'none');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- migrate:down
CREATE OR REPLACE FUNCTION guard_send_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type IN ('email_logged', 'dm_logged', 'sms_logged') THEN
    IF NEW.company_id IS NOT NULL AND NOT COALESCE((SELECT sendable FROM lead_gate WHERE company_id = NEW.company_id), false) THEN
      RAISE EXCEPTION 'Blocked: this lead is not an eligible active limited company, has opted out, or is on the suppression list.';
    END IF;
    IF NEW.contact_id IS NOT NULL AND COALESCE((SELECT blocked_person FROM contact_gate WHERE contact_id = NEW.contact_id), false) THEN
      RAISE EXCEPTION 'Blocked: this person has opted out or is on the suppression list.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP FUNCTION niche_allows(text, text);
DROP TABLE niche_rules;
