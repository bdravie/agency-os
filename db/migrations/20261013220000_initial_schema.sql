-- migrate:up

-- Shared trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TYPE deal_stage AS ENUM (
  'New', 'Contacted', 'Replied', 'Call booked', 'Proposal sent', 'Won', 'Lost'
);

-- Companies (company-level data only for scraped leads)
CREATE TABLE companies (
  id              bigserial PRIMARY KEY,
  name            text NOT NULL,
  domain          text,
  phone           text,
  address         text,
  postcode        text,
  niche           text,
  company_number  text,
  is_ltd          boolean,
  sic_codes       text[] NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'New',
  source          text,
  owner_notes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX companies_domain_uniq ON companies (lower(domain)) WHERE domain IS NOT NULL;
CREATE UNIQUE INDEX companies_number_uniq ON companies (company_number) WHERE company_number IS NOT NULL;
CREATE INDEX companies_niche_status_idx ON companies (niche, status);
CREATE INDEX companies_name_idx ON companies (lower(name));
CREATE TRIGGER companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Contacts: named people, only once they have engaged
CREATE TABLE contacts (
  id             bigserial PRIMARY KEY,
  company_id     bigint REFERENCES companies(id) ON DELETE SET NULL,
  name           text NOT NULL,
  role           text,
  email          text,
  phone          text,
  linkedin_url   text,
  consent_basis  text NOT NULL,   -- form, booking, replied, messaged, client
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_company_idx ON contacts (company_id);
CREATE INDEX contacts_email_idx ON contacts (lower(email));

-- Offers: the automation catalogue
CREATE TABLE offers (
  id                 bigserial PRIMARY KEY,
  name               text NOT NULL UNIQUE,
  niche              text,
  outcome            text,
  description        text,
  setup_price_gbp    numeric(10,2) NOT NULL DEFAULT 0,
  monthly_price_gbp  numeric(10,2) NOT NULL DEFAULT 0,
  loom_url           text,
  demo_path          text,
  active             boolean NOT NULL DEFAULT true
);

-- Deals
CREATE TABLE deals (
  id                 bigserial PRIMARY KEY,
  company_id         bigint REFERENCES companies(id) ON DELETE CASCADE,
  contact_id         bigint REFERENCES contacts(id) ON DELETE SET NULL,
  title              text NOT NULL,
  stage              deal_stage NOT NULL DEFAULT 'New',
  setup_value_gbp    numeric(10,2) NOT NULL DEFAULT 0,
  monthly_value_gbp  numeric(10,2) NOT NULL DEFAULT 0,
  offer_id           bigint REFERENCES offers(id) ON DELETE SET NULL,
  source             text,
  expected_close     date,
  lost_reason        text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deals_company_idx ON deals (company_id);
CREATE INDEX deals_stage_idx ON deals (stage);
CREATE TRIGGER deals_updated_at BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tasks
CREATE TABLE tasks (
  id          bigserial PRIMARY KEY,
  title       text NOT NULL,
  due_at      timestamptz,
  done_at     timestamptz,
  company_id  bigint REFERENCES companies(id) ON DELETE CASCADE,
  deal_id     bigint REFERENCES deals(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_open_due_idx ON tasks (due_at) WHERE done_at IS NULL;

-- Activities: every tracking event goes here via log_activity()
CREATE TABLE activities (
  id           bigserial PRIMARY KEY,
  company_id   bigint REFERENCES companies(id) ON DELETE CASCADE,
  contact_id   bigint REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id      bigint REFERENCES deals(id) ON DELETE SET NULL,
  type         text NOT NULL,
  channel      text,
  body         text,
  meta         jsonb NOT NULL DEFAULT '{}',
  occurred_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_company_idx ON activities (company_id, occurred_at DESC);
CREATE INDEX activities_deal_idx ON activities (deal_id, occurred_at DESC);
CREATE INDEX activities_type_idx ON activities (type, occurred_at DESC);

-- Quotes
CREATE TABLE quotes (
  id                 bigserial PRIMARY KEY,
  deal_id            bigint REFERENCES deals(id) ON DELETE CASCADE,
  offer_id           bigint REFERENCES offers(id) ON DELETE SET NULL,
  line_items         jsonb NOT NULL DEFAULT '[]',
  total_setup_gbp    numeric(10,2) NOT NULL DEFAULT 0,
  total_monthly_gbp  numeric(10,2) NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'Draft',
  sent_at            timestamptz,
  accepted_at        timestamptz,
  payment_link       text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quotes_deal_idx ON quotes (deal_id);

-- Client services: what each paying client has
CREATE TABLE client_services (
  id                bigserial PRIMARY KEY,
  company_id        bigint REFERENCES companies(id) ON DELETE CASCADE,
  offer_id          bigint REFERENCES offers(id) ON DELETE SET NULL,
  setup_fee_gbp     numeric(10,2) NOT NULL DEFAULT 0,
  monthly_fee_gbp   numeric(10,2) NOT NULL DEFAULT 0,
  start_date        date,
  status            text NOT NULL DEFAULT 'Active',
  next_review_date  date
);
CREATE INDEX client_services_company_idx ON client_services (company_id);

-- Upwork proposals
CREATE TABLE proposals (
  id             bigserial PRIMARY KEY,
  job_title      text,
  job_url        text,
  job_text       text NOT NULL,
  draft          text,
  fit_score      smallint CHECK (fit_score BETWEEN 1 AND 10),
  status         text NOT NULL DEFAULT 'Draft',
  connects_used  integer,
  sent_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX proposals_status_idx ON proposals (status);

-- Content pipeline
CREATE TABLE content_items (
  id          bigserial PRIMARY KEY,
  idea        text NOT NULL,
  hook        text,
  format      text,
  platforms   text[] NOT NULL DEFAULT '{}',
  script      text,
  caption     text,
  keyword     text,
  status      text NOT NULL DEFAULT 'Idea',
  posted_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_items_status_idx ON content_items (status);

-- Suppression: checked by every list-building and outreach feature
CREATE TABLE suppression (
  id        bigserial PRIMARY KEY,
  domain    text,
  email     text,
  reason    text,
  added_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (domain IS NOT NULL OR email IS NOT NULL)
);
CREATE UNIQUE INDEX suppression_domain_uniq ON suppression (lower(domain)) WHERE domain IS NOT NULL;
CREATE UNIQUE INDEX suppression_email_uniq ON suppression (lower(email)) WHERE email IS NOT NULL;

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
