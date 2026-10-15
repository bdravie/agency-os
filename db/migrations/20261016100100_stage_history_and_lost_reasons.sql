-- migrate:up

-- 1. Channel and lost note on deals (nullable: existing deals keep NULL, shown as "not set").
ALTER TABLE deals
  ADD COLUMN lost_note text,
  ADD COLUMN channel   text,
  ADD CONSTRAINT deals_channel_chk CHECK (channel IS NULL OR channel IN ('email', 'social_dm', 'upwork', 'sms', 'referral'));

-- 2. Every stage change, with a timestamp. Written by a trigger, so no code path can forget it.
CREATE TABLE stage_history (
  id          bigserial PRIMARY KEY,
  deal_id     bigint NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  from_stage  deal_stage,                       -- NULL when the deal was created
  to_stage    deal_stage NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  source      text NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'backfill'))
);
CREATE INDEX stage_history_deal_idx ON stage_history (deal_id, changed_at);
CREATE INDEX stage_history_to_idx   ON stage_history (to_stage, changed_at);

CREATE FUNCTION record_stage_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO stage_history (deal_id, from_stage, to_stage) VALUES (NEW.id, NULL, NEW.stage);
  ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO stage_history (deal_id, from_stage, to_stage) VALUES (NEW.id, OLD.stage, NEW.stage);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deals_stage_history AFTER INSERT OR UPDATE OF stage ON deals
  FOR EACH ROW EXECUTE FUNCTION record_stage_change();

-- 3. A deal cannot become Lost without one of the standard reasons. Only checked when it BECOMES lost,
--    so deals that are already Lost (with older, free-text or empty reasons) are left alone.
CREATE FUNCTION require_lost_reason() RETURNS trigger AS $$
BEGIN
  IF NEW.stage = 'Lost' AND (TG_OP = 'INSERT' OR OLD.stage IS DISTINCT FROM 'Lost') THEN
    IF NEW.lost_reason IS NULL OR NEW.lost_reason NOT IN ('price', 'timing', 'no_need', 'went_diy', 'competitor', 'no_response') THEN
      RAISE EXCEPTION 'A lost deal needs a reason: price, timing, no_need, went_diy, competitor or no_response'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deals_require_lost_reason BEFORE INSERT OR UPDATE OF stage ON deals
  FOR EACH ROW EXECUTE FUNCTION require_lost_reason();

-- 4. Baseline history for deals that already exist. We only know the CURRENT stage, so one row per deal,
--    marked 'backfill' so the dashboard never treats it as a real, timed stage change.
INSERT INTO stage_history (deal_id, from_stage, to_stage, changed_at, source)
SELECT id, NULL, stage, updated_at, 'backfill' FROM deals;

-- migrate:down
DROP TRIGGER deals_require_lost_reason ON deals;
DROP TRIGGER deals_stage_history ON deals;
DROP FUNCTION require_lost_reason();
DROP FUNCTION record_stage_change();
DROP TABLE stage_history;
ALTER TABLE deals DROP CONSTRAINT deals_channel_chk, DROP COLUMN channel, DROP COLUMN lost_note;
