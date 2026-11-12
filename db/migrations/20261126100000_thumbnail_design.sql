-- migrate:up

-- Thumbnail designs: the layout, title style, stickers and logos placed on a cover (checked and clamped in crm/lib/thumbnailDesign.ts).
-- Nullable, so the previous version of the CRM keeps working and older covers draw with the default layout.
ALTER TABLE content_thumbnails ADD COLUMN design jsonb;

-- The owner's logo library for covers: their own logo and the logos of tools shown in a video. Uploaded by hand, never fetched.
-- Images only, small, stored in the database like training files and served from an allow-list of types.
CREATE TABLE thumbnail_assets (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL CHECK (btrim(name) <> ''),
  mime        text NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  data        bytea NOT NULL,
  bytes       integer NOT NULL CHECK (bytes > 0 AND bytes <= 1048576),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE thumbnail_assets;
ALTER TABLE content_thumbnails DROP COLUMN design;
