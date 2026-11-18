-- migrate:up
-- CQC register as a Lead Sourcer source (docs/LEAD_SOURCER_PLAN.md, step 4). CQC's care directory is a free weekly CSV of every regulated
-- location in England (Open Government Licence v3): the trading name, address, business phone, website, service types and the provider, which is
-- the legal entity that runs it. Company-level only: the CRM keeps rows whose provider is a limited company, LLP or PLC, never the monthly file with
-- registered managers, and nothing about patients. It is fetched on a click, at most once a week, and kept here as a cache (replaced on refresh).

-- 1. Each download of the directory.
CREATE TABLE cqc_imports (
  id             bigserial PRIMARY KEY,
  file_url       text NOT NULL,
  file_date      date,
  service_types  text[] NOT NULL,           -- the service types kept (the niches' cqc.service_types at the time)
  rows_read      integer NOT NULL DEFAULT 0,
  rows_kept      integer NOT NULL DEFAULT 0,
  imported_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. The kept locations from the latest download.
CREATE TABLE cqc_locations (
  location_id         text PRIMARY KEY,
  import_id           bigint NOT NULL REFERENCES cqc_imports(id) ON DELETE CASCADE,
  name                text NOT NULL,          -- the name it trades under
  also_known_as       text,
  address             text,
  postcode            text,
  phone               text,                   -- the business's own number, as CQC lists it
  website             text,
  domain              text,
  service_types       text[] NOT NULL DEFAULT '{}',
  local_authority     text,
  region              text,
  provider_id         text,
  provider_name       text NOT NULL,          -- the registered company
  provider_locations  integer NOT NULL DEFAULT 1   -- how many locations that provider has in the whole file (a chain has many)
);
CREATE INDEX cqc_locations_types_idx ON cqc_locations USING gin (service_types);
CREATE INDEX cqc_locations_la_idx ON cqc_locations (lower(local_authority));

-- 3. A Lead Sourcer search of the register, and what it found, matched to Companies House a few at a time (like apify_results).
CREATE TABLE cqc_searches (
  id           bigserial PRIMARY KEY,
  niche        text NOT NULL,
  location     text NOT NULL,
  import_id    bigint REFERENCES cqc_imports(id) ON DELETE SET NULL,
  status       text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'done', 'failed')),
  found        integer NOT NULL DEFAULT 0,
  chains       integer NOT NULL DEFAULT 0,  -- locations left out because their provider runs too many (config: cqc.max_provider_locations)
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);

CREATE TABLE cqc_results (
  id                   bigserial PRIMARY KEY,
  search_id            bigint NOT NULL REFERENCES cqc_searches(id) ON DELETE CASCADE,
  location_id          text NOT NULL,
  name                 text NOT NULL,
  provider_name        text NOT NULL,
  address              text,
  postcode             text,
  phone                text,
  website              text,
  domain               text,
  service_types        text[] NOT NULL DEFAULT '{}',
  local_authority      text,
  match                text,                -- 'exact+postcode' | 'exact' | 'ambiguous' | 'none'; null = not matched yet
  ch_number            text,
  ch_name              text,
  ch_type              text,
  ch_status            text,
  eligible             text CHECK (eligible IN ('eligible', 'not_eligible', 'unmatched')),
  skip_reason          text,
  existing_company_id  bigint REFERENCES companies(id) ON DELETE SET NULL,
  added_at             timestamptz,
  UNIQUE (search_id, location_id)
);

ALTER TABLE sourcer_runs ADD COLUMN cqc_search_id bigint REFERENCES cqc_searches(id) ON DELETE SET NULL;

-- migrate:down
ALTER TABLE sourcer_runs DROP COLUMN cqc_search_id;
DROP TABLE cqc_results;
DROP TABLE cqc_searches;
DROP TABLE cqc_locations;
DROP TABLE cqc_imports;
