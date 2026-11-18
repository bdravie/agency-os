-- migrate:up
-- This week's list (Lead Sourcer > This week): the top gated companies in the niches that use email, and the one senior person
-- chosen for each from Apollo's free search. Before an email is revealed, only what the free search shows is kept
-- (first name, last initial, job title), and it goes when the row or the company is removed. A revealed person becomes a contact.
CREATE TABLE weekly_leads (
  id           bigserial PRIMARY KEY,
  week_start   date NOT NULL,
  company_id   bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  niche        text NOT NULL,
  suitability  integer NOT NULL DEFAULT 0,
  searched_at  timestamptz,
  search_note  text,
  candidates   jsonb NOT NULL DEFAULT '[]',
  apollo_id    text,
  contact_id   bigint REFERENCES contacts(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start, company_id)
);
CREATE INDEX weekly_leads_week_idx ON weekly_leads (week_start);

-- migrate:down
DROP TABLE weekly_leads;
