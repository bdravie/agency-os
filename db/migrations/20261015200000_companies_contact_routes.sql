-- migrate:up
-- Company-level contact routes only: company pages and generic inboxes, never named people.
ALTER TABLE companies
  ADD COLUMN linkedin_url     text,
  ADD COLUMN instagram_url    text,
  ADD COLUMN facebook_url     text,
  ADD COLUMN contact_url      text,
  ADD COLUMN domain_verified  text,          -- 'company number' | 'name' | 'manual'
  ADD COLUMN site_signals     jsonb,         -- e.g. {"meta_pixel": true, "google_ads": false, "runs_ads": true}
  ADD COLUMN site_checked_at  timestamptz;
ALTER TABLE companies ADD CONSTRAINT companies_linkedin_company_chk
  CHECK (linkedin_url IS NULL OR linkedin_url ~* '^https://www\.linkedin\.com/company/[^/?#]+/?$');
ALTER TABLE companies ADD CONSTRAINT companies_domain_verified_chk
  CHECK (domain_verified IS NULL OR domain_verified IN ('company number', 'name', 'manual'));

-- migrate:down
ALTER TABLE companies DROP CONSTRAINT companies_domain_verified_chk;
ALTER TABLE companies DROP CONSTRAINT companies_linkedin_company_chk;
ALTER TABLE companies DROP COLUMN linkedin_url, DROP COLUMN instagram_url, DROP COLUMN facebook_url, DROP COLUMN contact_url,
  DROP COLUMN domain_verified, DROP COLUMN site_signals, DROP COLUMN site_checked_at;
