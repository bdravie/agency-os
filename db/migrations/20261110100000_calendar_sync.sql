-- migrate:up

-- 1. A copy of the events on the owner's business Google Calendar, kept up to date by an incremental sync (about once a minute while the CRM is open).
--    Only what the Calendar page needs is saved: title, times, the Meet and Google links, and which saved contact/company the event is with.
--    Never saved: descriptions, locations, guest lists or guest email addresses (guests are only compared with saved contacts, then forgotten).
CREATE TABLE calendar_events (
  id                 bigserial PRIMARY KEY,
  connection_id      bigint NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
  google_event_id    text NOT NULL,
  title              text NOT NULL,
  starts_at          timestamptz NOT NULL,
  ends_at            timestamptz NOT NULL,
  all_day            boolean NOT NULL DEFAULT false,
  meet_url           text,
  html_link          text,
  status             text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
  company_id         bigint REFERENCES companies(id) ON DELETE SET NULL,   -- set when a guest matches a saved contact
  contact_id         bigint REFERENCES contacts(id) ON DELETE SET NULL,
  meeting_id         bigint REFERENCES meetings(id) ON DELETE SET NULL,    -- set when the CRM booked it
  synced_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, google_event_id)
);
CREATE INDEX calendar_events_starts_idx ON calendar_events (starts_at);
CREATE INDEX calendar_events_company_idx ON calendar_events (company_id) WHERE company_id IS NOT NULL;

-- 2. Where the sync has got to. The sync token lets Google send only what changed since the last check.
CREATE TABLE calendar_sync_state (
  connection_id      bigint PRIMARY KEY REFERENCES calendar_connections(id) ON DELETE CASCADE,
  sync_token         text,
  last_sync_at       timestamptz,
  last_full_sync_at  timestamptz,
  last_error         text
);

-- 3. CRM tasks with a due date are mirrored into the calendar as events with no guests (so nothing is emailed to anyone).
--    google_hash is a fingerprint of the title and time as last synced, so a change on either side can be told apart from our own echo.
--    google_unlinked is set when the owner deletes the event in Google: the task stays, and stops being mirrored.
ALTER TABLE tasks
  ADD COLUMN google_event_id text,
  ADD COLUMN google_hash text,
  ADD COLUMN google_unlinked boolean NOT NULL DEFAULT false;
CREATE INDEX tasks_google_event_idx ON tasks (google_event_id) WHERE google_event_id IS NOT NULL;

-- migrate:down
DROP INDEX tasks_google_event_idx;
ALTER TABLE tasks DROP COLUMN google_unlinked, DROP COLUMN google_hash, DROP COLUMN google_event_id;
DROP TABLE calendar_sync_state;
DROP TABLE calendar_events;
