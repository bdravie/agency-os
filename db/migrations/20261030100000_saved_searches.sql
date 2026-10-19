-- migrate:up

-- A saved Lead Sourcer brief: the niche, area, sources and filters, so a search can be set up again in one click.
-- It stores no results and no company data. Loading one only fills in the form; a paid source still runs only when you click Search.
CREATE TABLE saved_searches (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  niche       text NOT NULL,
  location    text NOT NULL,
  filters     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX saved_searches_name_key ON saved_searches (lower(btrim(name)));

-- migrate:down
DROP TABLE saved_searches;
