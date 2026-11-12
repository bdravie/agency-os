-- migrate:up

-- Video organiser: quick-capture notes and projects extending content_items.
-- Business ideas only: contact details (emails and phone numbers) are rejected in code.

ALTER TABLE content_items ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE content_items DROP CONSTRAINT IF EXISTS content_items_source_check;
ALTER TABLE content_items ADD CONSTRAINT content_items_source_check
  CHECK (source IN ('manual', 'generated', 'outlier', 'trend', 'pipeline', 'repurpose', 'quick_capture'));

CREATE TABLE IF NOT EXISTS content_projects (
  id              bigserial PRIMARY KEY,
  content_item_id bigint NOT NULL UNIQUE REFERENCES content_items (id) ON DELETE CASCADE,
  raw_notes       text,
  summary         text,
  talking_points  text[] NOT NULL DEFAULT '{}',
  checklist       jsonb NOT NULL DEFAULT '[
    {"key": "concept", "label": "Concept & hook", "done": true},
    {"key": "script", "label": "Script / talking points", "done": false},
    {"key": "film", "label": "A-roll filmed", "done": false},
    {"key": "broll", "label": "B-roll gathered", "done": false},
    {"key": "edit", "label": "Rough cut & sound", "done": false},
    {"key": "thumbs", "label": "Thumbnails created", "done": false},
    {"key": "schedule", "label": "Scheduled & captions", "done": false}
  ]'::jsonb,
  footage_path    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_projects_item_idx ON content_projects (content_item_id);

-- migrate:down
-- Business database migrations are forward-only.
