-- migrate:up

-- 1. Compliance fields on every lead (a lead is a row in companies).
ALTER TABLE companies
  ADD COLUMN company_type           text,                        -- Companies House type: ltd, llp, plc, ...
  ADD COLUMN company_status         text,                        -- Companies House status: active, dissolved, liquidation, ...
  ADD COLUMN compliance_status      text NOT NULL DEFAULT 'unchecked' CHECK (compliance_status IN ('unchecked', 'eligible', 'not_eligible')),
  ADD COLUMN compliance_checked_at  timestamptz,
  ADD COLUMN consent_basis          text CHECK (consent_basis IS NULL OR length(consent_basis) <= 300),   -- e.g. PECR corporate subscriber + legitimate interest
  ADD COLUMN contact_source         text CHECK (contact_source IS NULL OR length(contact_source) <= 200), -- where the email or phone came from
  ADD COLUMN opted_out              boolean NOT NULL DEFAULT false,
  ADD COLUMN opted_out_at           timestamptz,
  ADD COLUMN opt_out_note           text CHECK (opt_out_note IS NULL OR length(opt_out_note) <= 300),
  ADD CONSTRAINT companies_opt_out_chk CHECK (opted_out = (opted_out_at IS NOT NULL));

-- Known state: companies already marked as not limited can never be eligible; the fake demo companies are treated as verified.
UPDATE companies SET compliance_status = 'not_eligible' WHERE is_ltd = false;
UPDATE companies SET compliance_status = 'eligible', company_type = 'ltd', company_status = 'active' WHERE source = 'demo';

-- 2. The global suppression list can also hold phone numbers and company numbers (for SMS and company-level opt-outs).
ALTER TABLE suppression
  ADD COLUMN phone          text,                                 -- normalised: digits only, UK national format (07700900123)
  ADD COLUMN company_number text,
  ADD COLUMN source         text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'opt_out', 'import'));
ALTER TABLE suppression DROP CONSTRAINT suppression_check;
ALTER TABLE suppression ADD CONSTRAINT suppression_check CHECK (domain IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL OR company_number IS NOT NULL);
CREATE UNIQUE INDEX suppression_phone_uniq ON suppression (phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX suppression_number_uniq ON suppression (company_number) WHERE company_number IS NOT NULL;

-- 3. One definition of a UK phone number, used by the app, the Python tools and this database.
CREATE FUNCTION normalise_phone(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(regexp_replace(regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g'), '^(\+44|0044)0?', '0'), '')
$$;

-- 4. THE gate. Every send, list and draft reads this view, so the rule lives in one place:
--    a lead can be contacted only if it is a verified active ltd/llp/plc, has not opted out, and matches nothing on the suppression list.
CREATE VIEW lead_gate AS
SELECT x.*, (x.verified AND NOT x.opted_out AND NOT x.suppressed) AS sendable
  FROM (
    SELECT c.id AS company_id,
           c.compliance_status = 'eligible' AS verified,
           c.opted_out,
           EXISTS (
             SELECT 1 FROM suppression s
              WHERE (c.domain IS NOT NULL AND lower(s.domain) = lower(c.domain))
                 OR (c.generic_email IS NOT NULL AND lower(s.email) = lower(c.generic_email))
                 OR (c.company_number IS NOT NULL AND s.company_number = c.company_number)
                 OR (c.phone IS NOT NULL AND s.phone = normalise_phone(c.phone))
           ) AS suppressed
      FROM companies c
  ) x;

-- 5. Backstop: no code path (app, Python or SQL) can log an email, DM or SMS as sent to a lead that fails the gate.
CREATE FUNCTION guard_send_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type IN ('email_logged', 'dm_logged', 'sms_logged') AND NEW.company_id IS NOT NULL
     AND NOT COALESCE((SELECT sendable FROM lead_gate WHERE company_id = NEW.company_id), false) THEN
    RAISE EXCEPTION 'Blocked: this lead is not an eligible active limited company, has opted out, or is on the suppression list.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER activities_send_guard BEFORE INSERT ON activities FOR EACH ROW EXECUTE FUNCTION guard_send_activity();

-- 6. Lead searches started from the CRM run in the background; this records each run and what it printed.
CREATE TABLE lead_searches (
  id           bigserial PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('search', 'enrich')),
  niche        text,
  location     text,
  row_limit    smallint NOT NULL DEFAULT 50,
  dry_run      boolean NOT NULL DEFAULT false,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  output       text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);

-- migrate:down
DROP TABLE lead_searches;
DROP TRIGGER activities_send_guard ON activities;
DROP FUNCTION guard_send_activity();
DROP VIEW lead_gate;
DROP FUNCTION normalise_phone(text);
DROP INDEX suppression_number_uniq;
DROP INDEX suppression_phone_uniq;
ALTER TABLE suppression DROP CONSTRAINT suppression_check;
ALTER TABLE suppression ADD CONSTRAINT suppression_check CHECK (domain IS NOT NULL OR email IS NOT NULL);
ALTER TABLE suppression DROP COLUMN source, DROP COLUMN company_number, DROP COLUMN phone;
ALTER TABLE companies DROP CONSTRAINT companies_opt_out_chk,
  DROP COLUMN opt_out_note, DROP COLUMN opted_out_at, DROP COLUMN opted_out, DROP COLUMN contact_source, DROP COLUMN consent_basis,
  DROP COLUMN compliance_checked_at, DROP COLUMN compliance_status, DROP COLUMN company_status, DROP COLUMN company_type;
