-- migrate:up

-- Planning a LinkedIn post (Content > LinkedIn, L3): a time of day beside the planned day, and the CRM task that reminds the owner to post it.
-- The task is an ordinary task, so the calendar sync mirrors it into Google Calendar with no guests, exactly like every other task.
-- Nothing is posted by the app. Both columns are nullable, so the previous version of the CRM keeps working.
ALTER TABLE content_items
  ADD COLUMN scheduled_time time,
  ADD COLUMN reminder_task_id bigint REFERENCES tasks (id) ON DELETE SET NULL;

CREATE INDEX content_items_reminder_idx ON content_items (reminder_task_id) WHERE reminder_task_id IS NOT NULL;

-- migrate:down
DROP INDEX content_items_reminder_idx;
ALTER TABLE content_items DROP COLUMN reminder_task_id, DROP COLUMN scheduled_time;
