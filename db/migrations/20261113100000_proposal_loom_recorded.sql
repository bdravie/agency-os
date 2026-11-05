-- migrate:up

-- When the owner recorded the Loom a proposal's pitch pack scripted. Until it is set, a drafted proposal with a pitch pack counts as a Loom to record.
ALTER TABLE proposals ADD COLUMN loom_recorded_at timestamptz;

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
