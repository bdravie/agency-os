-- migrate:up

-- Click-to-post to LinkedIn (Content > LinkedIn, L6; approved by the owner 12 Nov 2026). One post at a time, only on the owner's click,
-- after a confirmation naming the profile, to the owner's own LinkedIn profile through LinkedIn's official API. Never scheduled, never in batches.
-- LinkedIn is still never read: no feed, no comments, no numbers.

-- The owner's LinkedIn profile, connected with Sign In with LinkedIn (OpenID Connect) and Share on LinkedIn (w_member_social).
-- The access token is encrypted with a key derived from SESSION_SECRET, like the Google tokens. LinkedIn gives no refresh token here: it lasts about 60 days.
CREATE TABLE linkedin_connections (
  id               bigserial PRIMARY KEY,
  person_sub       text NOT NULL UNIQUE,
  display_name     text,
  access_token_enc text,
  expires_at       timestamptz,
  connected_at     timestamptz NOT NULL DEFAULT now(),
  last_error       text
);

-- One row per post sent. Unique per content item, so a double click or a second tab can never post the same post twice.
-- A failed attempt can be tried again; a posted one keeps its LinkedIn id.
CREATE TABLE linkedin_publishes (
  id              bigserial PRIMARY KEY,
  content_item_id bigint NOT NULL UNIQUE REFERENCES content_items (id) ON DELETE CASCADE,
  connection_id   bigint REFERENCES linkedin_connections (id) ON DELETE SET NULL,
  status          text NOT NULL CHECK (status IN ('posting', 'posted', 'failed')),
  media_kind      text CHECK (media_kind IN ('image', 'document')),
  post_urn        text,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  posted_at       timestamptz
);
CREATE INDEX linkedin_publishes_posted_idx ON linkedin_publishes (posted_at) WHERE status = 'posted';

-- migrate:down
DROP TABLE linkedin_publishes;
DROP TABLE linkedin_connections;
