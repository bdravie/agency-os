-- migrate:up

-- Click-only suggestions for making a job a better fit (things to learn, build, change or ask), with a long-term verdict. One JSON document.
ALTER TABLE proposals ADD COLUMN improvements jsonb;
ALTER TABLE proposals ADD COLUMN improvements_at timestamptz;

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
