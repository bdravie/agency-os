-- migrate:up

-- Proposal pipeline: archive ("not pursuing", reversible), a reason for a lost proposal, when the status last changed,
-- and a permanent log of proposals deleted. Only adds columns and a table, so the previous version of the CRM keeps working.
ALTER TABLE proposals
  ADD COLUMN archived_at       timestamptz,
  ADD COLUMN archive_reason    text,
  ADD COLUMN lost_reason       text,
  ADD COLUMN lost_note         text,
  ADD COLUMN status_changed_at timestamptz NOT NULL DEFAULT now();

-- Existing proposals: the best guess at when they last changed is when they were sent, or created.
UPDATE proposals SET status_changed_at = CASE WHEN status = 'Draft' THEN created_at ELSE COALESCE(sent_at, created_at) END;

ALTER TABLE proposals
  ADD CONSTRAINT proposals_lost_reason_check CHECK (lost_reason IS NULL OR lost_reason IN ('no_reply', 'hired_other', 'job_closed', 'budget_too_low', 'withdrew', 'other')),
  ADD CONSTRAINT proposals_archive_reason_check CHECK (archive_reason IS NULL OR archive_reason IN ('not_a_fit', 'job_closed', 'duplicate', 'changed_mind'));

CREATE INDEX proposals_archived_idx ON proposals (archived_at);

-- A permanent record of every proposal deleted, with why. The proposal itself is deleted; this row stays.
CREATE TABLE proposal_deletions (
  id            bigserial PRIMARY KEY,
  deleted_at    timestamptz NOT NULL DEFAULT now(),
  proposal_id   bigint NOT NULL,                 -- the old id; no foreign key, the proposal no longer exists
  job_title     text,
  company_name  text,
  status        text NOT NULL,                   -- the status it had when removed
  category      text NOT NULL CHECK (category IN ('admin_mistake', 'not_a_fit', 'job_gone')),
  note          text NOT NULL CHECK (length(btrim(note)) >= 10),
  snapshot      jsonb NOT NULL                   -- the whole proposal row, for reference
);
CREATE INDEX proposal_deletions_deleted_at_idx ON proposal_deletions (deleted_at DESC);

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
