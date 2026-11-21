-- migrate:up
-- The knowledge-base assistant at the centre of the dashboard brain (crm/lib/assistant.ts). One row per message in a
-- conversation (thread). The owner asks; the AI answers only on the Ask click, from the knowledge files listed in
-- config/knowledge.yaml (and the web, only when the owner ticks it). Questions holding emails or phone numbers are refused
-- in code before anything is saved or sent, so this holds business questions, not anyone's contact details.
CREATE TABLE assistant_messages (
  id          bigserial PRIMARY KEY,
  thread_id   uuid NOT NULL,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL CHECK (length(content) BETWEEN 1 AND 20000),
  topic       text,                                   -- the topic chosen for the question (crm, research, design, contracts) or null for any
  sources     jsonb NOT NULL DEFAULT '[]'::jsonb,     -- what the answer was given: [{ref, kind: 'file'|'web', title, path|url}]
  model       text,
  web         boolean NOT NULL DEFAULT false,         -- the owner ticked Search the web for this question
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assistant_messages_thread_idx ON assistant_messages (thread_id, created_at);
CREATE INDEX assistant_messages_day_idx ON assistant_messages (created_at) WHERE role = 'assistant';

-- migrate:down
DROP TABLE assistant_messages;
