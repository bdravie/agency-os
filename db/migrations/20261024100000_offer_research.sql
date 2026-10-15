-- migrate:up

-- 1. A snapshot of what we found out about a company from its own public website (and, if you ask, a web search). Free to produce.
CREATE TABLE company_research (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  domain      text,
  site        jsonb,                          -- facts read from the pages (null if there was no readable site)
  findings    jsonb NOT NULL DEFAULT '[]',    -- the gaps and strengths worked out from those facts
  web         jsonb,                          -- search snippets, only if a web search was run
  limits      jsonb NOT NULL DEFAULT '[]',    -- what could not be checked
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_research_company_idx ON company_research (company_id, created_at DESC);

-- 2. The offer ideas drafted from a research snapshot (Claude, only when you click).
CREATE TABLE offer_suggestions (
  id           bigserial PRIMARY KEY,
  company_id   bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  research_id  bigint REFERENCES company_research(id) ON DELETE SET NULL,
  model        text NOT NULL,
  result       jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offer_suggestions_company_idx ON offer_suggestions (company_id, created_at DESC);

-- migrate:down
DROP TABLE offer_suggestions;
DROP TABLE company_research;
