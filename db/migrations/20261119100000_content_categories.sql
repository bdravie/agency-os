-- migrate:up
CREATE TABLE IF NOT EXISTS content_categories (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  colour TEXT NOT NULL DEFAULT 'var(--accent)',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed from content.content_niche in config/niches.yaml
INSERT INTO content_categories (key, label, colour, active) VALUES
  ('trades', 'Trades', 'var(--accent)', true),
  ('dental', 'Dental', 'var(--cyan)', true),
  ('aesthetics', 'Aesthetics', 'var(--violet)', true)
ON CONFLICT (key) DO NOTHING;

-- migrate:down
DROP TABLE IF EXISTS content_categories;
