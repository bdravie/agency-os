-- migrate:up
-- The owner's own research notes on a company, fed to the AI offer suggestions. In their own table, not on companies:
-- saving one must not bump companies.updated_at, which would mark the website research as out of date.
CREATE TABLE company_research_notes (
  company_id bigint PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  notes      text NOT NULL CHECK (char_length(notes) BETWEEN 1 AND 2000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE company_research_notes;
