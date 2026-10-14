-- migrate:up
ALTER TABLE content_items ADD COLUMN scheduled_for date;
CREATE INDEX content_items_scheduled_idx ON content_items (scheduled_for) WHERE scheduled_for IS NOT NULL;

-- migrate:down
DROP INDEX content_items_scheduled_idx;
ALTER TABLE content_items DROP COLUMN scheduled_for;
