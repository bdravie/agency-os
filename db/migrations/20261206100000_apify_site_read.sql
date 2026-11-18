-- migrate:up
-- Lead Sourcer step 3 (docs/LEAD_SOURCER_PLAN.md): what the CRM found when it read a Google Maps result's own website (free, robots.txt respected).
-- Company-level only: pages read, the company number(s) the site shows, whether one was used to match Companies House and why, and which
-- details came from the site (generic emails on its own domain, company social pages, a contact page). It records which step found each
-- detail, so the hit rate per step can be worked out later. Nullable: older rows and rows without a website keep null.
ALTER TABLE apify_results ADD COLUMN site_read jsonb;

-- migrate:down
ALTER TABLE apify_results DROP COLUMN site_read;
