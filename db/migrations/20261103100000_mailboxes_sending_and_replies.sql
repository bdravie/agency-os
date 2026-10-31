-- migrate:up

-- 1. The owner's own Google mailboxes. The refresh token is stored encrypted (see crm/lib/mailCrypto.ts); NULL = disconnected.
CREATE TABLE mailboxes (
  id                 bigserial PRIMARY KEY,
  email              text NOT NULL,
  display_name       text,
  refresh_token_enc  text,
  daily_cap          integer NOT NULL DEFAULT 10 CHECK (daily_cap BETWEEN 0 AND 500),
  active             boolean NOT NULL DEFAULT true,
  connected_at       timestamptz NOT NULL DEFAULT now(),
  last_checked_at    timestamptz,
  last_error         text
);
CREATE UNIQUE INDEX mailboxes_email_uniq ON mailboxes (lower(email));

-- 2. Every email the CRM sent on a click. 'sending' is written first so the daily cap counts it even while Google is answering.
CREATE TABLE sent_emails (
  id                bigserial PRIMARY KEY,
  mailbox_id        bigint NOT NULL REFERENCES mailboxes(id) ON DELETE RESTRICT,
  company_id        bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id        bigint REFERENCES contacts(id) ON DELETE SET NULL,
  kind              text NOT NULL CHECK (kind IN ('first', 'followup')),
  to_email          text NOT NULL,
  subject           text NOT NULL,
  body              text NOT NULL,
  status            text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  error             text,
  gmail_message_id  text,
  gmail_thread_id   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  sent_at           timestamptz
);
CREATE INDEX sent_emails_mailbox_day_idx ON sent_emails (mailbox_id, created_at DESC);
CREATE INDEX sent_emails_thread_idx ON sent_emails (gmail_thread_id) WHERE gmail_thread_id IS NOT NULL;
CREATE INDEX sent_emails_to_idx ON sent_emails (lower(to_email));

-- 3. Replies found in threads the CRM started. Only these threads are ever read.
CREATE TABLE email_replies (
  id                bigserial PRIMARY KEY,
  sent_email_id     bigint NOT NULL REFERENCES sent_emails(id) ON DELETE CASCADE,
  mailbox_id        bigint NOT NULL REFERENCES mailboxes(id) ON DELETE RESTRICT,
  company_id        bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id        bigint REFERENCES contacts(id) ON DELETE SET NULL,
  gmail_message_id  text NOT NULL UNIQUE,
  gmail_thread_id   text NOT NULL,
  from_email        text NOT NULL,
  from_name         text,
  subject           text,
  body              text NOT NULL,
  received_at       timestamptz NOT NULL,
  is_auto           boolean NOT NULL DEFAULT false,
  looks_like_optout boolean NOT NULL DEFAULT false,
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_replies_inbox_idx ON email_replies (mailbox_id, received_at DESC);
CREATE INDEX email_replies_unread_idx ON email_replies (received_at DESC) WHERE read_at IS NULL AND NOT is_auto;

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
