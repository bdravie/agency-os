-- migrate:up

-- 1. Extra detail kept on a lead when it comes from Google Maps (company-level facts only).
ALTER TABLE companies
  ADD COLUMN city             text,
  ADD COLUMN latitude         double precision,
  ADD COLUMN longitude        double precision,
  ADD COLUMN maps_place_id    text,
  ADD COLUMN maps_url         text,
  ADD COLUMN maps_rating      numeric(2,1) CHECK (maps_rating IS NULL OR maps_rating BETWEEN 0 AND 5),
  ADD COLUMN maps_reviews     integer CHECK (maps_reviews IS NULL OR maps_reviews >= 0),
  ADD COLUMN maps_categories  text[] NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX companies_maps_place_uniq ON companies (maps_place_id) WHERE maps_place_id IS NOT NULL;

-- 2. Every Apify run, with what it was allowed to spend and what it actually cost. The daily and monthly limits are worked out from this.
CREATE TABLE apify_runs (
  id              bigserial PRIMARY KEY,
  niche           text,
  query           text NOT NULL,
  location        text NOT NULL,
  max_places      smallint NOT NULL CHECK (max_places BETWEEN 1 AND 200),
  contacts        boolean NOT NULL DEFAULT true,
  website_filter  text NOT NULL DEFAULT 'allPlaces',
  est_usd         numeric(8,4) NOT NULL,         -- our estimate before the run
  max_charge_usd  numeric(8,4) NOT NULL,         -- the hard cap sent to Apify: it stops charging beyond this
  cost_usd        numeric(8,4),                  -- what Apify says it actually cost (null until it finishes)
  apify_run_id    text,
  dataset_id      text,
  status          text NOT NULL DEFAULT 'starting' CHECK (status IN ('starting', 'running', 'processing', 'done', 'failed')),
  error           text,
  items           integer,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);

-- 3. What a run found, matched against Companies House and ranked, waiting for you to choose which to add. Nothing reaches companies until you click Add.
CREATE TABLE apify_results (
  id                   bigserial PRIMARY KEY,
  run_id               bigint NOT NULL REFERENCES apify_runs(id) ON DELETE CASCADE,
  place_id             text NOT NULL,
  title                text NOT NULL,
  address              text,
  street               text,
  city                 text,
  postcode             text,
  latitude             double precision,
  longitude            double precision,
  phone                text,
  website              text,
  domain               text,
  rating               numeric(2,1),
  reviews              integer,
  categories           text[] NOT NULL DEFAULT '{}',
  maps_url             text,
  emails               text[] NOT NULL DEFAULT '{}',      -- generic company addresses only (info@, hello@...), never named people
  socials              jsonb NOT NULL DEFAULT '{}',        -- company pages only
  closed               text,                               -- 'temporary' | 'permanent'
  match                text,                               -- how it was matched to Companies House: 'exact+postcode' | 'exact' | 'ambiguous' | 'none'; null = not processed yet
  ch_number            text,
  ch_name              text,
  ch_type              text,
  ch_status            text,
  eligible             text CHECK (eligible IN ('eligible', 'not_eligible', 'unmatched')),
  priority             smallint,
  reasons              jsonb NOT NULL DEFAULT '[]',
  skip_reason          text,
  existing_company_id  bigint,
  added_at             timestamptz,
  UNIQUE (run_id, place_id)
);

-- migrate:down
DROP TABLE apify_results;
DROP TABLE apify_runs;
DROP INDEX companies_maps_place_uniq;
ALTER TABLE companies DROP COLUMN maps_categories, DROP COLUMN maps_reviews, DROP COLUMN maps_rating, DROP COLUMN maps_url,
  DROP COLUMN maps_place_id, DROP COLUMN longitude, DROP COLUMN latitude, DROP COLUMN city;
