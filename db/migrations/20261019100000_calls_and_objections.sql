-- migrate:up

-- 1. A call belongs to a client (company) and usually a deal. The stored transcript has emails, phone numbers and
--    speaker names masked before it is saved; the original upload is never kept.
CREATE TABLE calls (
  id                  bigserial PRIMARY KEY,
  company_id          bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deal_id             bigint REFERENCES deals(id) ON DELETE SET NULL,
  title               text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  source              text NOT NULL CHECK (source IN ('transcript', 'vtt', 'notes')),
  transcript          text,                                   -- NULL once you remove it; the analysis is kept
  transcript_chars    integer NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'saved' CHECK (status IN ('saved', 'analysed', 'failed')),
  summary             text,
  pains               jsonb NOT NULL DEFAULT '[]',            -- [{"pain": "...", "quote": "..." | null}]
  budget_signals      jsonb NOT NULL DEFAULT '[]',            -- [{"signal": "...", "quote": "..." | null}]
  next_step           text,
  follow_up_on        date,
  follow_up_assumed   boolean NOT NULL DEFAULT false,         -- true when no date was agreed and a default was used
  follow_up_task_id   bigint REFERENCES tasks(id) ON DELETE SET NULL,
  analysed_at         timestamptz,
  analysis_model      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calls_company_idx ON calls (company_id, occurred_at DESC);
CREATE INDEX calls_deal_idx ON calls (deal_id);
CREATE TRIGGER calls_updated_at BEFORE UPDATE ON calls FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. The Objection Library: one row per kind of objection, with your best response.
CREATE TABLE objections (
  id             bigserial PRIMARY KEY,
  name           text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  best_response  text CHECK (best_response IS NULL OR length(best_response) <= 3000),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX objections_name_uniq ON objections (lower(name));
CREATE TRIGGER objections_updated_at BEFORE UPDATE ON objections FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. Where each objection was raised. A library entry that has been raised cannot be deleted (merge it instead).
CREATE TABLE call_objections (
  id            bigserial PRIMARY KEY,
  call_id       bigint NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  objection_id  bigint NOT NULL REFERENCES objections(id) ON DELETE RESTRICT,
  quote         text CHECK (quote IS NULL OR length(quote) <= 400),   -- a verbatim excerpt, checked against the transcript
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_id, objection_id)
);
CREATE INDEX call_objections_objection_idx ON call_objections (objection_id);

-- migrate:down
DROP TABLE call_objections;
DROP TABLE objections;
DROP TABLE calls;
