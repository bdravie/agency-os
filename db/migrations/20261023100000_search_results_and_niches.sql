-- migrate:up

-- 1. What a search found, kept so you can choose which companies to add (nothing is saved to companies until you click Add).
CREATE TABLE lead_search_results (
  id              bigserial PRIMARY KEY,
  search_id       bigint NOT NULL REFERENCES lead_searches(id) ON DELETE CASCADE,
  company_number  text NOT NULL,
  name            text NOT NULL,
  address         text,
  postcode        text,
  sic_codes       text[] NOT NULL DEFAULT '{}',
  company_type    text,
  company_status  text,
  fit_score       smallint,
  fit_notes       text,
  est_revenue_gbp numeric(14,2),
  facts           jsonb,                       -- the Companies House health facts, so adding needs no further API calls
  skip_reason     text,                        -- 'Already in the CRM' or 'On your suppression list'
  added_at        timestamptz,
  UNIQUE (search_id, company_number)
);

-- 2. Niches you add in the app (the ones in config/niches.yaml stay there; these are merged in).
CREATE TABLE custom_niches (
  id            bigserial PRIMARY KEY,
  key           text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  label         text NOT NULL CHECK (length(label) BETWEEN 2 AND 60),
  sic_codes     text[] NOT NULL CHECK (cardinality(sic_codes) BETWEEN 1 AND 8),
  search_terms  text[] NOT NULL DEFAULT '{}',
  offer         text CHECK (offer IS NULL OR length(offer) <= 300),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE custom_niches;
DROP TABLE lead_search_results;
