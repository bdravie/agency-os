-- migrate:up

-- Build Plan pipeline for a proposal (crm/lib/buildPlan.ts): pain points, a matching workflow, a demo workflow and a tailored
-- build plan, kept as one JSON document with a part per step. Nullable and additive, so the previous version of the CRM keeps working.
ALTER TABLE proposals ADD COLUMN build_plan jsonb;
ALTER TABLE proposals ADD COLUMN build_plan_at timestamptz;

-- A third way a proposal can be started, so the Loom-against-plain comparison does not count build plans as plain drafts.
-- The previous version of the CRM treats any mode that is not 'loom' as a plain proposal, so it still opens these.
ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_pitch_mode_check;
ALTER TABLE proposals ADD CONSTRAINT proposals_pitch_mode_check CHECK (pitch_mode IN ('plain', 'loom', 'build_plan'));

-- The owner's own saved workflows (n8n exports and Make blueprints, uploaded by hand). Only the parsed outline is kept:
-- step names, apps and how the steps connect. The uploaded file itself is never stored, because an export can carry
-- webhook addresses, credential names and email addresses in its settings.
CREATE TABLE workflow_library (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 120),
  platform    text NOT NULL CHECK (platform IN ('n8n', 'make')),
  solves      text CHECK (solves IS NULL OR char_length(solves) <= 300),   -- the owner's own line: the problem it solves
  tags        text[] NOT NULL DEFAULT '{}',
  apps        text[] NOT NULL DEFAULT '{}',
  workflow    jsonb NOT NULL,                                               -- the parsed outline (crm/lib/workflowParse.ts)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER workflow_library_updated_at BEFORE UPDATE ON workflow_library FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A case study is a proof item of kind 'client' or 'own_business'. The client is never named to a prospect, so this is
-- how it is described instead ("a dental practice", "a lettings agency").
ALTER TABLE proof_items ADD COLUMN client_type text CHECK (client_type IS NULL OR char_length(client_type) <= 80);

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
