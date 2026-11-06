-- migrate:up

-- Loom pitch mode for a proposal: a new mode beside the plain draft and the pitch pack. Additive, so the previous version of the CRM keeps working.
-- pitch_mode lets later comparisons split Loom pitches from plain ones. loom_inputs holds what was typed beside the job post (budget, screening questions, client info).
-- The client's name is only ever a first name kept on the proposal, never a contact.
ALTER TABLE proposals ADD COLUMN pitch_mode text NOT NULL DEFAULT 'plain' CHECK (pitch_mode IN ('plain', 'loom'));
ALTER TABLE proposals ADD COLUMN loom_inputs jsonb;
ALTER TABLE proposals ADD COLUMN loom_pitch jsonb;
ALTER TABLE proposals ADD COLUMN loom_pitch_at timestamptz;
ALTER TABLE proposals ADD COLUMN loom_url text;

-- The owner's real projects: the only proof the Loom pitch may use. An item with no one_line is held back from the generator until it is filled in.
-- kind stops a demo being described as client work; last_worked_on is what lets the script say "recently".
CREATE TABLE proof_items (
  id             bigserial PRIMARY KEY,
  name           text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 120),
  kind           text NOT NULL DEFAULT 'demo' CHECK (kind IN ('client', 'own_business', 'demo', 'internal_tool')),
  one_line       text,
  problem_solved text,
  tools          text[] NOT NULL DEFAULT '{}',
  results        text,
  link           text,
  tags           text[] NOT NULL DEFAULT '{}',
  last_worked_on date,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER proof_items_updated_at BEFORE UPDATE ON proof_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One row: how the owner describes themselves. The Loom pitch reads it, so it improves as this is updated.
CREATE TABLE pitch_profile (
  id                 boolean PRIMARY KEY DEFAULT true CHECK (id),
  name               text,
  positioning_line   text,
  short_positioning  text,
  strong_tools       text[] NOT NULL DEFAULT '{}',
  familiar_tools     text[] NOT NULL DEFAULT '{}',
  preferred_defaults text,
  portfolio_links    jsonb NOT NULL DEFAULT '[]',
  facts              text[] NOT NULL DEFAULT '{}',
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER pitch_profile_updated_at BEFORE UPDATE ON pitch_profile FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Reusable answers to screening questions, so each application is faster than the last.
CREATE TABLE answer_bank (
  id           bigserial PRIMARY KEY,
  category     text NOT NULL DEFAULT 'custom' CHECK (category IN ('cover_letter', 'certifications', 'experience', 'tone', 'metrics', 'custom')),
  question     text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 500),
  answer       text NOT NULL CHECK (char_length(answer) BETWEEN 1 AND 3000),
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER answer_bank_updated_at BEFORE UPDATE ON answer_bank FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
