-- migrate:up

-- Follower tracking: stores social follower/subscriber snapshots across platforms (YouTube, Instagram, TikTok, LinkedIn).
-- Polled automatically for supported APIs; LinkedIn is strictly recorded by hand per CLAUDE.md rules.

CREATE TABLE IF NOT EXISTS follower_accounts (
  id              bigserial PRIMARY KEY,
  platform        text NOT NULL CHECK (platform IN ('youtube', 'instagram', 'tiktok', 'linkedin')),
  handle          text NOT NULL,
  account_id      text,
  url             text,
  enabled         boolean NOT NULL DEFAULT true,
  auto_poll       boolean NOT NULL DEFAULT true,
  last_polled_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follower_accounts_platform_handle_uniq UNIQUE (platform, handle)
);

CREATE TABLE IF NOT EXISTS follower_snapshots (
  id              bigserial PRIMARY KEY,
  account_id      bigint REFERENCES follower_accounts (id) ON DELETE CASCADE,
  platform        text NOT NULL CHECK (platform IN ('youtube', 'instagram', 'tiktok', 'linkedin')),
  follower_count  int NOT NULL CHECK (follower_count >= 0),
  delta_daily     int,
  source          text NOT NULL CHECK (source IN ('api', 'manual')),
  notes           text,
  captured_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS follower_snapshots_platform_idx ON follower_snapshots (platform, captured_at DESC);
CREATE INDEX IF NOT EXISTS follower_snapshots_account_idx ON follower_snapshots (account_id, captured_at DESC);

-- Seed starter accounts for the 4 core platforms.
INSERT INTO follower_accounts (platform, handle, auto_poll)
VALUES
  ('youtube', '@bradravie', true),
  ('instagram', 'bradravie', true),
  ('tiktok', '@bradravie', true),
  ('linkedin', 'bradravie', false)
ON CONFLICT (platform, handle) DO NOTHING;

-- migrate:down
-- Forward-only database migration.
