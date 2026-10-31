-- migrate:up

-- Why a job got its fit score (factors, benefits, risks), and the click-only plan with milestones, hours and price.
-- Both are stored as JSON because they are always read and shown whole.
ALTER TABLE proposals ADD COLUMN fit_analysis jsonb;
ALTER TABLE proposals ADD COLUMN plan jsonb;
ALTER TABLE proposals ADD COLUMN plan_at timestamptz;

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
