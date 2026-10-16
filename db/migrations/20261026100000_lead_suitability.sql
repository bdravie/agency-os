-- migrate:up

-- How suitable a company in the CRM is to approach, 0-100, worked out in ONE place so the list, its sorting, its filters and the tooltips agree.
-- Weights: Companies House fit 60 (size, age, filing health), verified contactable 15, generic email 8, website 5, phone 3, Google rating 5, review count 4.
-- Anything that cannot be contacted (not an eligible company, opted out, suppressed) or has filing problems scores 0 and is tier 'Skip'.
-- Tiers: A at 60 or more, B at 40 or more, otherwise C.
CREATE VIEW lead_suitability AS
WITH p AS (
  SELECT c.id AS company_id,
         (c.compliance_status = 'not_eligible' OR g.opted_out OR g.suppressed OR c.filing_ok IS FALSE) AS excluded,
         round(coalesce(c.fit_score, 0) * 0.6)::int                                                              AS fit_pts,
         CASE WHEN c.compliance_status = 'eligible' THEN 15 ELSE 0 END                                           AS eligible_pts,
         CASE WHEN c.domain IS NOT NULL THEN 5 ELSE 0 END                                                        AS website_pts,
         CASE WHEN c.generic_email IS NOT NULL THEN 8 ELSE 0 END                                                 AS email_pts,
         CASE WHEN c.phone IS NOT NULL THEN 3 ELSE 0 END                                                         AS phone_pts,
         CASE WHEN c.maps_rating >= 4.5 THEN 3 WHEN c.maps_rating >= 3 THEN 5 WHEN c.maps_rating IS NOT NULL THEN 2 ELSE 0 END AS rating_pts,
         CASE WHEN c.maps_reviews BETWEEN 15 AND 400 THEN 4 WHEN c.maps_reviews > 400 THEN 1 ELSE 0 END          AS reviews_pts
    FROM companies c JOIN lead_gate g ON g.company_id = c.id
)
SELECT company_id, excluded, fit_pts, eligible_pts, website_pts, email_pts, phone_pts, rating_pts, reviews_pts,
       CASE WHEN excluded THEN 0 ELSE LEAST(100, fit_pts + eligible_pts + website_pts + email_pts + phone_pts + rating_pts + reviews_pts) END AS score,
       CASE WHEN excluded THEN 'Skip'
            WHEN fit_pts + eligible_pts + website_pts + email_pts + phone_pts + rating_pts + reviews_pts >= 60 THEN 'A'
            WHEN fit_pts + eligible_pts + website_pts + email_pts + phone_pts + rating_pts + reviews_pts >= 40 THEN 'B'
            ELSE 'C' END AS tier
  FROM p;

-- migrate:down
DROP VIEW lead_suitability;
