-- migrate:up

-- Owner-approved bypass (6 Nov 2026) for a company that cannot be found on Companies House (for example it trades under a different name).
-- The owner confirms with their password and writes why. It only ever applies to a company whose status is still 'unchecked': a company
-- looked up and found not eligible stays blocked, and so does one that has opted out or is on the suppression list.
-- Only adds columns and changes the rule inside lead_gate (same columns, same order), so the previous version of the CRM keeps working.
ALTER TABLE companies
  ADD COLUMN gate_bypass_at     timestamptz,
  ADD COLUMN gate_bypass_reason text,
  ADD CONSTRAINT companies_gate_bypass_chk CHECK (
    (gate_bypass_at IS NULL AND gate_bypass_reason IS NULL)
    OR (gate_bypass_at IS NOT NULL AND length(btrim(gate_bypass_reason)) BETWEEN 15 AND 300));

-- `verified` still means "found on Companies House as an active ltd/llp/plc". `sendable` now also accepts the owner's bypass, but only
-- while the company is still unchecked. Opt-outs and the suppression list always win. contact_gate, the send guard and every other
-- reader of `sendable` follow automatically.
CREATE OR REPLACE VIEW lead_gate AS
SELECT x.company_id, x.verified, x.opted_out, x.suppressed,
       ((x.verified OR x.bypassed) AND NOT x.opted_out AND NOT x.suppressed) AS sendable
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
           ) AS suppressed,
           (c.compliance_status = 'unchecked' AND c.gate_bypass_at IS NOT NULL) AS bypassed
      FROM companies c
  ) x;

-- migrate:down
-- Not possible to drop the extra column from a view that others depend on, so rebuild it with the same columns and the original rule.
CREATE OR REPLACE VIEW lead_gate AS
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
ALTER TABLE companies DROP CONSTRAINT companies_gate_bypass_chk, DROP COLUMN gate_bypass_reason, DROP COLUMN gate_bypass_at;
