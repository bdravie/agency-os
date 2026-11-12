-- migrate:up

-- Carousels for LinkedIn posts (Content > LinkedIn, L5): a fifth kind of post image, downloaded as a PDF to post as a LinkedIn document.
-- The slides live in the same design column as every other image. The previous version of the CRM draws an unknown kind as a quote card, so it keeps working.
ALTER TABLE post_images DROP CONSTRAINT post_images_kind_check;
ALTER TABLE post_images ADD CONSTRAINT post_images_kind_check CHECK (kind IN ('quote', 'steps', 'compare', 'diagram', 'carousel'));

-- migrate:down
ALTER TABLE post_images DROP CONSTRAINT post_images_kind_check;
ALTER TABLE post_images ADD CONSTRAINT post_images_kind_check CHECK (kind IN ('quote', 'steps', 'compare', 'diagram'));
