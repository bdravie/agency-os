-- migrate:up

-- Images for LinkedIn posts (Content > LinkedIn): a quote card, numbered steps, before / after or a workflow diagram,
-- built from the words of the post rather than a video frame. Each is plain data (checked and clamped in
-- crm/lib/linkedinMath.ts) and drawn in the browser, so no image file is stored.
-- A LinkedIn post is a content item whose format is 'LinkedIn post', as it has been since repurposing was built,
-- so nothing changes on content_items and the previous version of the CRM keeps working.
CREATE TABLE post_images (
  id              bigserial PRIMARY KEY,
  content_item_id bigint NOT NULL REFERENCES content_items (id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('quote', 'steps', 'compare', 'diagram')),
  design          jsonb NOT NULL,
  selected        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX post_images_item_idx ON post_images (content_item_id);
-- One chosen image per post.
CREATE UNIQUE INDEX post_images_one_selected ON post_images (content_item_id) WHERE selected;

-- migrate:down
DROP TABLE post_images;
