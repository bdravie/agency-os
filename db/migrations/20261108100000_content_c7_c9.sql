-- migrate:up

-- C9: a second hook per idea, so two hooks can be tested against each other (hook A is content_items.hook).
ALTER TABLE content_items ADD COLUMN hook_alt text;

-- C8: one weekly content brief per week. The numbers are worked out in code and kept as they were shown; the AI only writes the prose.
CREATE TABLE content_briefs (
  id         bigserial PRIMARY KEY,
  week_start date NOT NULL UNIQUE,
  numbers    jsonb NOT NULL,
  prose      jsonb NOT NULL,
  model      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
