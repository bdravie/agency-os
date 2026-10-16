-- migrate:up

-- 1. An audit belongs to a client (company) and usually to a deal.
CREATE TABLE audits (
  id                   bigserial PRIMARY KEY,
  company_id           bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deal_id              bigint REFERENCES deals(id) ON DELETE SET NULL,
  title                text NOT NULL,
  context              text,                                   -- short business overview; never personal data
  hourly_rate_gbp      numeric(8,2) NOT NULL DEFAULT 25 CHECK (hourly_rate_gbp > 0),
  automation_share     numeric(3,2) NOT NULL DEFAULT 0.70 CHECK (automation_share BETWEEN 0.10 AND 1),
  status               text NOT NULL DEFAULT 'intake' CHECK (status IN ('intake', 'report_drafted', 'delivered')),
  report               jsonb,                                  -- the drafted (and edited) report text
  report_model         text,
  report_generated_at  timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audits_company_idx ON audits (company_id);
CREATE INDEX audits_deal_idx ON audits (deal_id);
CREATE TRIGGER audits_updated_at BEFORE UPDATE ON audits FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. The intake: one row per recurring task.
CREATE TABLE audit_tasks (
  id                bigserial PRIMARY KEY,
  audit_id          bigint NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  name              text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  performed_by      text CHECK (performed_by IS NULL OR length(performed_by) <= 100),    -- a role or team, not a person's name
  hours_per_week    numeric(5,1) NOT NULL CHECK (hours_per_week >= 0 AND hours_per_week <= 200),
  frequency         text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'ad_hoc')),
  error_rate_pct    numeric(5,2) NOT NULL DEFAULT 0 CHECK (error_rate_pct BETWEEN 0 AND 100),
  revenue_impact    text NOT NULL CHECK (revenue_impact IN ('low', 'medium', 'high')),
  data_sensitivity  text NOT NULL DEFAULT 'none' CHECK (data_sensitivity IN ('none', 'personal', 'special_category')),
  ease              smallint CHECK (ease BETWEEN 1 AND 5),         -- your judgement; NULL = a default from the frequency
  notes             text CHECK (notes IS NULL OR length(notes) <= 500),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_tasks_audit_idx ON audit_tasks (audit_id);

-- 3. Files kept against the client record (audit PDFs now; quotes and others can use it later).
CREATE TABLE company_documents (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deal_id       bigint REFERENCES deals(id) ON DELETE SET NULL,
  audit_id      bigint REFERENCES audits(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('audit_report', 'quote', 'other')),
  filename      text NOT NULL,
  content_type  text NOT NULL DEFAULT 'application/pdf',
  size_bytes    integer NOT NULL CHECK (size_bytes > 0),
  data          bytea NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_documents_company_idx ON company_documents (company_id, created_at DESC);

-- migrate:down
DROP TABLE company_documents;
DROP TABLE audit_tasks;
DROP TABLE audits;
