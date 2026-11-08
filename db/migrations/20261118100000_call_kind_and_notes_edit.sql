-- migrate:up

-- Calls can now be phone calls, video calls or in-person meetings, and the owner's own notes can be edited after saving.
-- Only adds columns with defaults, so the previous version of the CRM keeps working (it just never sets them).
--   kind             what it was; existing rows are phone calls by default
--   notes_edited_at  set when the saved text is changed by hand, so the page can say the AI analysis is out of date
ALTER TABLE calls
  ADD COLUMN kind            text NOT NULL DEFAULT 'call' CHECK (kind IN ('call', 'video', 'in_person')),
  ADD COLUMN notes_edited_at timestamptz;

-- migrate:down
ALTER TABLE calls DROP COLUMN notes_edited_at, DROP COLUMN kind;
