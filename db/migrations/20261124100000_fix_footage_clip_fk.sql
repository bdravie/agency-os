-- migrate:up

-- Fix: foreign key on footage_clips.used_in_project_id should reference content_items (the video projects table)
-- so clip assignments use the standard content item ID rather than content_projects primary key.

ALTER TABLE footage_clips DROP CONSTRAINT IF EXISTS footage_clips_used_in_project_id_fkey;
ALTER TABLE footage_clips ADD CONSTRAINT footage_clips_used_in_project_id_fkey
  FOREIGN KEY (used_in_project_id) REFERENCES content_items (id) ON DELETE SET NULL;

-- Ensure content_thumbnails table is created if migration 20261122100000 was skipped
CREATE TABLE IF NOT EXISTS content_thumbnails (
  id                bigserial PRIMARY KEY,
  content_item_id   bigint REFERENCES content_items (id) ON DELETE CASCADE,
  clip_id           bigint REFERENCES footage_clips (id) ON DELETE SET NULL,
  format            text NOT NULL CHECK (format IN ('16:9', '9:16')),
  headline          text NOT NULL,
  subhead           text,
  frame_url         text,
  overlay_style     text NOT NULL DEFAULT 'gradient',
  contrast_ratio    numeric(4, 2),
  performance_score int CHECK (performance_score BETWEEN 1 AND 10),
  platform_risk     text CHECK (platform_risk IN ('Low', 'Medium', 'High')),
  risk_reasons      text[] NOT NULL DEFAULT '{}',
  selected          boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_thumbnails_item_idx ON content_thumbnails (content_item_id);

-- migrate:down
-- Forward-only database migration.
