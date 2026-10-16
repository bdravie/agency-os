-- migrate:up

-- 1. An outcome record: one per client engagement you want to prove results for. Business metrics only, never people's data.
CREATE TABLE outcomes (
  id                  bigserial PRIMARY KEY,
  company_id          bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deal_id             bigint REFERENCES deals(id) ON DELETE SET NULL,
  title               text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  kickoff_on          date NOT NULL,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  built               text CHECK (built IS NULL OR length(built) <= 800),     -- what was set up, in plain words
  testimonial_status  text NOT NULL DEFAULT 'not_asked' CHECK (testimonial_status IN ('not_asked', 'requested', 'received', 'declined')),
  case_study          jsonb,                                  -- drafted (and edited) case study and testimonial request
  case_study_model    text,
  case_study_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outcomes_company_idx ON outcomes (company_id);
CREATE TRIGGER outcomes_updated_at BEFORE UPDATE ON outcomes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. The metrics tracked, each with its kickoff baseline and which direction is better.
CREATE TABLE outcome_metrics (
  id          bigserial PRIMARY KEY,
  outcome_id  bigint NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  unit        text NOT NULL DEFAULT '' CHECK (length(unit) <= 20),
  better      text NOT NULL CHECK (better IN ('lower', 'higher')),
  baseline    numeric(14,2) NOT NULL CHECK (baseline >= 0),
  position    smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX outcome_metrics_name_idx ON outcome_metrics (outcome_id, lower(name));

-- 3. One reading per metric per calendar month (period is always the first of the month).
CREATE TABLE outcome_readings (
  id          bigserial PRIMARY KEY,
  metric_id   bigint NOT NULL REFERENCES outcome_metrics(id) ON DELETE CASCADE,
  period      date NOT NULL CHECK (period = date_trunc('month', period)::date),
  value       numeric(14,2) NOT NULL CHECK (value >= 0),
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'csv')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric_id, period)
);
CREATE TRIGGER outcome_readings_updated_at BEFORE UPDATE ON outcome_readings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. The wording of each monthly report (the numbers are always recalculated from the readings).
CREATE TABLE outcome_reports (
  id                bigserial PRIMARY KEY,
  outcome_id        bigint NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  period            date NOT NULL CHECK (period = date_trunc('month', period)::date),
  wins              jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_improvement  text,
  model             text,
  generated_at      timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outcome_id, period)
);
CREATE TRIGGER outcome_reports_updated_at BEFORE UPDATE ON outcome_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. Saved monthly report PDFs live with the other client documents.
ALTER TABLE company_documents DROP CONSTRAINT company_documents_kind_check;
ALTER TABLE company_documents ADD CONSTRAINT company_documents_kind_check CHECK (kind IN ('audit_report', 'quote', 'other', 'client_report'));
ALTER TABLE company_documents ADD COLUMN outcome_id bigint REFERENCES outcomes(id) ON DELETE SET NULL;

-- migrate:down
ALTER TABLE company_documents DROP COLUMN outcome_id;
ALTER TABLE company_documents DROP CONSTRAINT company_documents_kind_check;
ALTER TABLE company_documents ADD CONSTRAINT company_documents_kind_check CHECK (kind IN ('audit_report', 'quote', 'other'));
DROP TABLE outcome_reports;
DROP TABLE outcome_readings;
DROP TABLE outcome_metrics;
DROP TABLE outcomes;
