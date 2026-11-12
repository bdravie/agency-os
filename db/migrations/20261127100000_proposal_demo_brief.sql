-- migrate:up

-- Click-only demo brief for a proposal: what the job needs that the owner has nothing to show for yet, and one small demo to build
-- for it (handed to Claude Code as a brief). One JSON document. Nullable, so the previous version of the CRM keeps working.
ALTER TABLE proposals ADD COLUMN demo_brief jsonb;
ALTER TABLE proposals ADD COLUMN demo_brief_at timestamptz;

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
