-- migrate:up

-- Content > Styles: the owner's own edit templates, and which template a video is to be edited with.
-- The starter templates and every element live in config/edit-styles.yaml; this table only holds templates made on screen.
-- beats is a list of { label, layout, elements, seconds, note }, checked in code (cleanTemplate in crm/lib/editStylesMath.ts).
-- content_items.edit_template is a yaml template's key, or custom-<id> for a row here. Nullable, so the previous version of the CRM keeps working.
CREATE TABLE edit_templates (
  id bigserial PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  format text NOT NULL DEFAULT '',
  niche text NOT NULL DEFAULT '',
  length text NOT NULL DEFAULT '',
  blurb text NOT NULL DEFAULT '',
  beats jsonb NOT NULL CHECK (jsonb_typeof(beats) = 'array' AND jsonb_array_length(beats) BETWEEN 2 AND 12),
  based_on text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_items ADD COLUMN edit_template text;

-- migrate:down
ALTER TABLE content_items DROP COLUMN edit_template;
DROP TABLE edit_templates;
