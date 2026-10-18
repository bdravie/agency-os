-- migrate:up

-- 1. Contacts found through Apollo carry where they came from, a person-level opt-out, and Apollo's own id (so the same person is never saved twice).
ALTER TABLE contacts
  ADD COLUMN source        text,
  ADD COLUMN apollo_id     text,
  ADD COLUMN email_status  text,
  ADD COLUMN revealed_at   timestamptz,
  ADD COLUMN opted_out     boolean NOT NULL DEFAULT false,
  ADD COLUMN opted_out_at  timestamptz,
  ADD CONSTRAINT contacts_opt_out_chk CHECK (opted_out = (opted_out_at IS NOT NULL));
CREATE UNIQUE INDEX contacts_apollo_uniq ON contacts (apollo_id) WHERE apollo_id IS NOT NULL;

-- 2. Every Apollo call and the credits it used. The daily credit limit is worked out from this.
CREATE TABLE apollo_calls (
  id          bigserial PRIMARY KEY,
  company_id  bigint REFERENCES companies(id) ON DELETE SET NULL,
  kind        text NOT NULL CHECK (kind IN ('search', 'reveal')),
  credits     integer NOT NULL DEFAULT 0 CHECK (credits >= 0),
  people      integer NOT NULL DEFAULT 0,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX apollo_calls_day_idx ON apollo_calls (created_at);

-- 3. May this PERSON be emailed? The company must pass lead_gate AND the person must not have opted out AND their address must not be suppressed.
--    blocked_person is the person-only part (used by the database guard, since a DM to a person needs no email address).
CREATE VIEW contact_gate AS
SELECT ct.id AS contact_id, ct.company_id,
       (ct.opted_out OR (ct.email IS NOT NULL AND EXISTS (SELECT 1 FROM suppression s WHERE lower(s.email) = lower(ct.email)))) AS blocked_person,
       (COALESCE(g.sendable, false) AND ct.email IS NOT NULL AND NOT ct.opted_out
         AND NOT EXISTS (SELECT 1 FROM suppression s WHERE lower(s.email) = lower(ct.email))) AS sendable
  FROM contacts ct LEFT JOIN lead_gate g ON g.company_id = ct.company_id;

-- 4. The send guard now also refuses to log a send to a person who has opted out or is suppressed.
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

-- migrate:down
CREATE OR REPLACE FUNCTION guard_send_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type IN ('email_logged', 'dm_logged', 'sms_logged') AND NEW.company_id IS NOT NULL
     AND NOT COALESCE((SELECT sendable FROM lead_gate WHERE company_id = NEW.company_id), false) THEN
    RAISE EXCEPTION 'Blocked: this lead is not an eligible active limited company, has opted out, or is on the suppression list.';
  END IF;
  RETURN NEW;
END $$;
DROP VIEW contact_gate;
DROP TABLE apollo_calls;
DROP INDEX contacts_apollo_uniq;
ALTER TABLE contacts DROP CONSTRAINT contacts_opt_out_chk,
  DROP COLUMN opted_out_at, DROP COLUMN opted_out, DROP COLUMN revealed_at, DROP COLUMN email_status, DROP COLUMN apollo_id, DROP COLUMN source;
