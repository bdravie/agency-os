-- migrate:up

-- The Upwork pitch pack for a proposal: the filled-in cover letter, a Loom script written for that job and a workflow diagram (Mermaid).
-- Stored as one JSON document because the pieces are always read and shown together.
ALTER TABLE proposals ADD COLUMN pack jsonb;
ALTER TABLE proposals ADD COLUMN pack_at timestamptz;

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
