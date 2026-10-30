-- migrate:up

-- The client's company name for an Upwork proposal, when the job post gives one. Free text: it is a label, not a link to a CRM company.
ALTER TABLE proposals ADD COLUMN company_name text;

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
