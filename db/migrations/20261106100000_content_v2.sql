-- migrate:up

-- Content engine v2 (docs/CONTENT_ENGINE_V2.md, C1): what was posted, how it did, the creators followed and the trends seen.
-- Public post data only: no commenter names, no follower lists, no personal data.

-- 1. Tag every content item so results can be compared by pillar, hook, niche and where the idea came from.
ALTER TABLE content_items
  ADD COLUMN niche             text,
  ADD COLUMN pillar            text CHECK (pillar IN ('Show the build', 'Build in public', 'Teach / steal this', 'Niche pain')),
  ADD COLUMN hook_type         text,
  ADD COLUMN length_s          int CHECK (length_s IS NULL OR length_s > 0),
  ADD COLUMN source            text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'generated', 'outlier', 'trend', 'pipeline', 'repurpose')),
  ADD COLUMN source_ref        text,
  ADD COLUMN idea_score        int CHECK (idea_score IS NULL OR idea_score BETWEEN 1 AND 10),
  ADD COLUMN idea_score_reason text,
  ADD COLUMN archived_at       timestamptz;

-- The four pillars were stored as the "format" until now. Other formats (Short video, LinkedIn post, Newsletter) are not pillars.
UPDATE content_items SET pillar = format WHERE format IN ('Show the build', 'Build in public', 'Teach / steal this', 'Niche pain');
UPDATE content_items SET archived_at = now() WHERE status = 'Archived' AND archived_at IS NULL;
UPDATE content_items SET source = 'generated' WHERE format IN ('Show the build', 'Build in public', 'Teach / steal this', 'Niche pain') AND hook IS NOT NULL AND script IS NULL;

CREATE INDEX content_items_pillar_idx ON content_items (pillar) WHERE pillar IS NOT NULL;

-- 2. One row per platform a video was posted to.
CREATE TABLE posts (
  id              bigserial PRIMARY KEY,
  content_item_id bigint NOT NULL REFERENCES content_items (id) ON DELETE CASCADE,
  platform        text NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'youtube', 'linkedin')),
  external_id     text,
  url             text NOT NULL UNIQUE,
  hook_used       text,
  posted_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_content_item_idx ON posts (content_item_id);
CREATE INDEX posts_platform_posted_idx ON posts (platform, posted_at DESC);

-- 3. Numbers for a post at 24 hours, 72 hours and 7 days (168 hours). One row per post per checkpoint; entering it again replaces it.
CREATE TABLE post_metrics (
  id          bigserial PRIMARY KEY,
  post_id     bigint NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  bucket      smallint NOT NULL CHECK (bucket IN (24, 72, 168)),
  captured_at timestamptz NOT NULL DEFAULT now(),
  age_hours   numeric(8, 1),
  views       int CHECK (views >= 0),
  likes       int CHECK (likes >= 0),
  comments    int CHECK (comments >= 0),
  shares      int CHECK (shares >= 0),
  saves       int CHECK (saves >= 0),
  follows     int CHECK (follows >= 0),
  avg_watch_s numeric(8, 1) CHECK (avg_watch_s >= 0),
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('api', 'manual')),
  UNIQUE (post_id, bucket)
);

-- 4. Creators followed by hand, and their public posts (used from C5).
CREATE TABLE creators (
  id              bigserial PRIMARY KEY,
  platform        text NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'youtube', 'linkedin')),
  handle          text NOT NULL,
  profile_url     text,
  niche           text,
  why_i_follow    text,
  active          boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, handle)
);

CREATE TABLE creator_posts (
  id            bigserial PRIMARY KEY,
  creator_id    bigint NOT NULL REFERENCES creators (id) ON DELETE CASCADE,
  platform      text NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'youtube', 'linkedin')),
  external_id   text NOT NULL UNIQUE,
  url           text,
  caption       text,
  posted_at     timestamptz,
  duration_s    int,
  views         bigint,
  likes         bigint,
  comments      bigint,
  shares        bigint,
  outlier_score numeric(8, 2),
  breakdown     jsonb,
  fetched_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX creator_posts_creator_idx ON creator_posts (creator_id, posted_at DESC);
CREATE INDEX creator_posts_outlier_idx ON creator_posts (outlier_score DESC) WHERE outlier_score IS NOT NULL;

-- 5. Trends noticed (added by hand, or read from allowed sources later).
CREATE TABLE trend_signals (
  id                 bigserial PRIMARY KEY,
  source             text NOT NULL CHECK (source IN ('manual', 'reddit', 'google_trends', 'sound')),
  niche              text,
  title              text NOT NULL,
  detail             text,
  url                text,
  score              numeric(10, 2),
  seen_at            timestamptz NOT NULL DEFAULT now(),
  used_in_content_id bigint REFERENCES content_items (id) ON DELETE SET NULL
);
CREATE INDEX trend_signals_seen_idx ON trend_signals (seen_at DESC);

-- 6. What content tools cost, so scraping spend can be seen.
CREATE TABLE content_runs (
  id       bigserial PRIMARY KEY,
  tool     text NOT NULL,
  cost_usd numeric(10, 4) NOT NULL DEFAULT 0,
  items    int NOT NULL DEFAULT 0,
  ran_at   timestamptz NOT NULL DEFAULT now()
);

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
