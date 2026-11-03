-- migrate:up

-- 1. The owner's Google Calendar connection (same Google sign-in app as the mailboxes). The refresh token is stored encrypted
--    (crm/lib/mailCrypto.ts); NULL = disconnected. Events on the calendar are read live and never copied into the database.
CREATE TABLE calendar_connections (
  id                 bigserial PRIMARY KEY,
  email              text NOT NULL,
  display_name       text,
  refresh_token_enc  text,
  calendar_id        text NOT NULL DEFAULT 'primary',
  connected_at       timestamptz NOT NULL DEFAULT now(),
  last_error         text
);
CREATE UNIQUE INDEX calendar_connections_email_uniq ON calendar_connections (lower(email));

-- 2. Meetings booked from the CRM on the owner's click. 'booking' is written first so a double click cannot book twice and the
--    daily cap counts it even while Google is answering. Google sends the invitation (with the Meet link) to the person.
CREATE TABLE meetings (
  id               bigserial PRIMARY KEY,
  connection_id    bigint REFERENCES calendar_connections(id) ON DELETE SET NULL,
  company_id       bigint REFERENCES companies(id) ON DELETE SET NULL,
  contact_id       bigint REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id          bigint REFERENCES deals(id) ON DELETE SET NULL,
  title            text NOT NULL,
  notes            text,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  attendee_email   text NOT NULL,
  google_event_id  text,
  meet_url         text,
  html_link        text,
  status           text NOT NULL DEFAULT 'booking' CHECK (status IN ('booking', 'scheduled', 'cancelled', 'failed')),
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  cancelled_at     timestamptz,
  CHECK (ends_at > starts_at)
);
CREATE INDEX meetings_starts_idx ON meetings (starts_at);
CREATE INDEX meetings_company_idx ON meetings (company_id);

-- 3. The database refuses a new meeting with a person who has opted out or is suppressed, or at a company that has opted out,
--    whatever the app does. (A meeting is never cold outreach: it is only for a saved contact who has engaged.)
CREATE FUNCTION guard_meeting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL AND COALESCE((SELECT blocked_person FROM contact_gate WHERE contact_id = NEW.contact_id), false) THEN
    RAISE EXCEPTION 'Blocked: this person has opted out or is on the suppression list.';
  END IF;
  IF NEW.company_id IS NOT NULL AND COALESCE((SELECT opted_out FROM companies WHERE id = NEW.company_id), false) THEN
    RAISE EXCEPTION 'Blocked: this company has opted out.';
  END IF;
  IF EXISTS (SELECT 1 FROM suppression s WHERE lower(s.email) = lower(NEW.attendee_email) OR lower(s.domain) = lower(split_part(NEW.attendee_email, '@', 2))) THEN
    RAISE EXCEPTION 'Blocked: this email address or its domain is on the suppression list.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER meetings_guard BEFORE INSERT ON meetings FOR EACH ROW EXECUTE FUNCTION guard_meeting();

-- migrate:down
DROP TRIGGER meetings_guard ON meetings;
DROP FUNCTION guard_meeting();
DROP TABLE meetings;
DROP TABLE calendar_connections;
