-- migrate:up

-- Raw footage library: scan local footage folders, extract frames with ffmpeg,
-- classify clips with AI, and safely rename with an undo history log.
-- Never deletes or moves files; protects clips locked to an active project.

CREATE TABLE IF NOT EXISTS footage_scans (
  id              bigserial PRIMARY KEY,
  folder_path     text NOT NULL,
  clip_count      int NOT NULL DEFAULT 0,
  estimated_cost  numeric(6, 4) NOT NULL DEFAULT 0,
  real_cost       numeric(6, 4) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS footage_clips (
  id                  bigserial PRIMARY KEY,
  scan_id             bigint REFERENCES footage_scans (id) ON DELETE CASCADE,
  folder_path         text NOT NULL,
  current_name        text NOT NULL,
  original_name       text NOT NULL,
  suggested_name      text,
  clip_type           text CHECK (clip_type IN ('talking_head', 'b_roll', 'screen_recording', 'unknown')),
  duration_s          numeric(8, 2),
  resolution          text,
  fps                 numeric(5, 2),
  frame_path          text,
  ai_label            text,
  ai_confidence       numeric(3, 2),
  used_in_project_id  bigint REFERENCES content_projects (id) ON DELETE SET NULL,
  renamed_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (folder_path, current_name)
);

CREATE INDEX IF NOT EXISTS footage_clips_folder_idx ON footage_clips (folder_path);
CREATE INDEX IF NOT EXISTS footage_clips_project_idx ON footage_clips (used_in_project_id);

CREATE TABLE IF NOT EXISTS footage_renames (
  id          bigserial PRIMARY KEY,
  clip_id     bigint REFERENCES footage_clips (id) ON DELETE CASCADE,
  folder_path text NOT NULL,
  old_name    text NOT NULL,
  new_name    text NOT NULL,
  undone_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS footage_renames_clip_idx ON footage_renames (clip_id);
CREATE INDEX IF NOT EXISTS footage_renames_created_idx ON footage_renames (created_at DESC);

-- migrate:down
-- Business database migrations are forward-only.
