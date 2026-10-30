-- migrate:up

-- Rapport points for a saved decision-maker: things they have said or done in a professional capacity, from public pages, each with its source.
-- Written only when the owner clicks. Removed with the contact (ON DELETE CASCADE), or on request with the Clear button.
CREATE TABLE contact_rapport (
  id          bigserial PRIMARY KEY,
  contact_id  bigint NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  model       text,
  points      jsonb NOT NULL DEFAULT '[]',   -- [{ kind, text, opener, source_url, source_title, quote }]
  limits      jsonb NOT NULL DEFAULT '[]'    -- plain-English notes on what was and was not looked at
);
CREATE INDEX contact_rapport_contact_idx ON contact_rapport (contact_id, created_at DESC);

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
