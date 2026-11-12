-- migrate:up

-- Thumbnail builder: stores generated thumbnail variants (16:9 and 9:16),
-- with headline copy, contrast ratios, performance scores, and platform risk ratings.

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
