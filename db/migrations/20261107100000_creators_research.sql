-- migrate:up

-- Creator research (docs/CONTENT_ENGINE_V2.md, C5). Public profile and post information only, for creators the owner adds by hand.
-- Never stored: comments, commenter names, followers or following lists, tagged or mentioned people, private accounts.

ALTER TABLE creators
  ADD COLUMN display_name       text,
  ADD COLUMN bio                text,
  ADD COLUMN link_in_bio        text,
  ADD COLUMN followers          bigint CHECK (followers IS NULL OR followers >= 0),
  ADD COLUMN verified           boolean,
  ADD COLUMN profile_checked_at timestamptz;

ALTER TABLE creator_posts
  ADD COLUMN hashtags    text[] NOT NULL DEFAULT '{}',
  ADD COLUMN sound       text,
  ADD COLUMN post_type   text,
  ADD COLUMN saves       bigint,
  ADD COLUMN cta_keyword text,
  ADD COLUMN review      text NOT NULL DEFAULT 'new' CHECK (review IN ('new', 'saved', 'dismissed')),
  ADD COLUMN reviewed_at timestamptz;

CREATE INDEX creator_posts_review_idx ON creator_posts (review, outlier_score DESC) WHERE outlier_score IS NOT NULL;

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
