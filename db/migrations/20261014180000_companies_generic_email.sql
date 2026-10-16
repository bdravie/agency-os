-- migrate:up
-- Company-level generic address only (info@, hello@, contact@, enquiries@). Never a named person's email.
ALTER TABLE companies ADD COLUMN generic_email text;
ALTER TABLE companies ADD CONSTRAINT companies_generic_email_chk
  CHECK (generic_email IS NULL OR lower(split_part(generic_email, '@', 1)) IN
    ('info', 'hello', 'contact', 'enquiries', 'enquiry', 'office', 'admin', 'team', 'sales', 'support'));

-- migrate:down
ALTER TABLE companies DROP CONSTRAINT companies_generic_email_chk;
ALTER TABLE companies DROP COLUMN generic_email;
