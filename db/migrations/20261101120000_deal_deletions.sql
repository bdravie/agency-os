-- migrate:up

-- A permanent record of every deal removed from the pipeline, with why. The deal itself is deleted (so it leaves the board,
-- funnel and revenue), but this row stays, so the owner can tell wasted leads from admin mistakes later.
CREATE TABLE deal_deletions (
  id            bigserial PRIMARY KEY,
  deleted_at    timestamptz NOT NULL DEFAULT now(),
  deal_id       bigint NOT NULL,                 -- the old id; no foreign key, the deal no longer exists
  title         text NOT NULL,
  company_id    bigint REFERENCES companies(id) ON DELETE SET NULL,
  company_name  text,
  stage         text NOT NULL,                   -- the stage it was in when removed
  setup_gbp     numeric(12,2) NOT NULL DEFAULT 0,
  monthly_gbp   numeric(12,2) NOT NULL DEFAULT 0,
  category      text NOT NULL CHECK (category IN ('admin_mistake', 'wasted_lead')),
  note          text NOT NULL CHECK (length(btrim(note)) >= 10),
  snapshot      jsonb NOT NULL                   -- the whole deal row, for reference
);
CREATE INDEX deal_deletions_deleted_at_idx ON deal_deletions (deleted_at DESC);

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
