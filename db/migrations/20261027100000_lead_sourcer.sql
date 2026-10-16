-- migrate:up

-- 1. The suitability weights in ONE place: a function. The CRM list (the lead_suitability view) and the Lead Sourcer results both call it,
--    so a company scores the same before and after it is added. Weights are unchanged from the earlier view.
CREATE FUNCTION suitability_points(fit integer, eligible boolean, has_site boolean, has_email boolean, has_phone boolean, rating numeric, reviews integer, excluded boolean)
RETURNS TABLE (fit_pts integer, eligible_pts integer, website_pts integer, email_pts integer, phone_pts integer, rating_pts integer, reviews_pts integer, score integer, tier text)
LANGUAGE sql IMMUTABLE AS $$
  WITH p AS (
    SELECT round(coalesce(fit, 0) * 0.6)::integer AS a,
           CASE WHEN eligible THEN 15 ELSE 0 END AS b,
           CASE WHEN has_site THEN 5 ELSE 0 END AS c,
           CASE WHEN has_email THEN 8 ELSE 0 END AS d,
           CASE WHEN has_phone THEN 3 ELSE 0 END AS e,
           CASE WHEN rating >= 4.5 THEN 3 WHEN rating >= 3 THEN 5 WHEN rating IS NOT NULL THEN 2 ELSE 0 END AS f,
           CASE WHEN reviews BETWEEN 15 AND 400 THEN 4 WHEN reviews > 400 THEN 1 ELSE 0 END AS g
  )
  SELECT a, b, c, d, e, f, g,
         CASE WHEN excluded THEN 0 ELSE LEAST(100, a + b + c + d + e + f + g) END,
         CASE WHEN excluded THEN 'Skip' WHEN a + b + c + d + e + f + g >= 60 THEN 'A' WHEN a + b + c + d + e + f + g >= 40 THEN 'B' ELSE 'C' END
    FROM p
$$;

CREATE OR REPLACE VIEW lead_suitability AS
SELECT c.id AS company_id, x.excluded, sp.fit_pts, sp.eligible_pts, sp.website_pts, sp.email_pts, sp.phone_pts, sp.rating_pts, sp.reviews_pts, sp.score, sp.tier
  FROM companies c
  JOIN lead_gate g ON g.company_id = c.id
 CROSS JOIN LATERAL (SELECT (c.compliance_status = 'not_eligible' OR g.opted_out OR g.suppressed OR c.filing_ok IS FALSE) AS excluded) x
 CROSS JOIN LATERAL suitability_points(c.fit_score, c.compliance_status = 'eligible', c.domain IS NOT NULL, c.generic_email IS NOT NULL, c.phone IS NOT NULL, c.maps_rating, c.maps_reviews, x.excluded) sp;

-- 2. One Lead Sourcer search: the filters you chose, which sources it used, and the runs it started in each (their results stay in the existing tables and are merged on screen).
CREATE TABLE sourcer_runs (
  id             bigserial PRIMARY KEY,
  niche          text NOT NULL,
  location       text NOT NULL,
  filters        jsonb NOT NULL DEFAULT '{}',
  sources        text[] NOT NULL,
  ch_search_id   bigint REFERENCES lead_searches(id) ON DELETE SET NULL,
  apify_run_id   bigint REFERENCES apify_runs(id) ON DELETE SET NULL,
  warnings       jsonb NOT NULL DEFAULT '[]',
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE sourcer_runs;
CREATE OR REPLACE VIEW lead_suitability AS
WITH p AS (
  SELECT c.id AS company_id,
         (c.compliance_status = 'not_eligible' OR g.opted_out OR g.suppressed OR c.filing_ok IS FALSE) AS excluded,
         round(coalesce(c.fit_score, 0) * 0.6)::int AS fit_pts,
         CASE WHEN c.compliance_status = 'eligible' THEN 15 ELSE 0 END AS eligible_pts,
         CASE WHEN c.domain IS NOT NULL THEN 5 ELSE 0 END AS website_pts,
         CASE WHEN c.generic_email IS NOT NULL THEN 8 ELSE 0 END AS email_pts,
         CASE WHEN c.phone IS NOT NULL THEN 3 ELSE 0 END AS phone_pts,
         CASE WHEN c.maps_rating >= 4.5 THEN 3 WHEN c.maps_rating >= 3 THEN 5 WHEN c.maps_rating IS NOT NULL THEN 2 ELSE 0 END AS rating_pts,
         CASE WHEN c.maps_reviews BETWEEN 15 AND 400 THEN 4 WHEN c.maps_reviews > 400 THEN 1 ELSE 0 END AS reviews_pts
    FROM companies c JOIN lead_gate g ON g.company_id = c.id
)
SELECT company_id, excluded, fit_pts, eligible_pts, website_pts, email_pts, phone_pts, rating_pts, reviews_pts,
       CASE WHEN excluded THEN 0 ELSE LEAST(100, fit_pts + eligible_pts + website_pts + email_pts + phone_pts + rating_pts + reviews_pts) END AS score,
       CASE WHEN excluded THEN 'Skip' WHEN fit_pts + eligible_pts + website_pts + email_pts + phone_pts + rating_pts + reviews_pts >= 60 THEN 'A'
            WHEN fit_pts + eligible_pts + website_pts + email_pts + phone_pts + rating_pts + reviews_pts >= 40 THEN 'B' ELSE 'C' END AS tier
  FROM p;
DROP FUNCTION suitability_points(integer, boolean, boolean, boolean, boolean, numeric, integer, boolean);
