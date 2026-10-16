-- migrate:up transaction:false
-- New pipeline stage between "Call booked" and "Proposal sent" (shown as "Proposal"). Existing rows are untouched.
ALTER TYPE deal_stage ADD VALUE IF NOT EXISTS 'Audit sold' BEFORE 'Proposal sent';

-- migrate:down
-- Postgres cannot remove an enum value; leaving 'Audit sold' in place is harmless.
SELECT 1;
