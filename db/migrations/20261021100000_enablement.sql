-- migrate:up

-- 1. The client's staff who are trained: a name and role only (never contact details). skill_level is the latest 1-3 rating.
CREATE TABLE enablement_staff (
  id           bigserial PRIMARY KEY,
  company_id   bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  role         text CHECK (role IS NULL OR length(role) <= 80),
  skill_level  smallint CHECK (skill_level BETWEEN 1 AND 3),
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX enablement_staff_name_idx ON enablement_staff (company_id, lower(name));
CREATE TRIGGER enablement_staff_updated_at BEFORE UPDATE ON enablement_staff FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. A recurring session schedule. next_on moves forward each time a session is logged against it.
CREATE TABLE enablement_schedules (
  id           bigserial PRIMARY KEY,
  company_id   bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title        text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  cadence      text NOT NULL CHECK (cadence IN ('weekly', 'fortnightly', 'monthly')),
  next_on      date NOT NULL,
  duration_minutes smallint NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 5 AND 600),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  task_id      bigint REFERENCES tasks(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enablement_schedules_company_idx ON enablement_schedules (company_id);
CREATE TRIGGER enablement_schedules_updated_at BEFORE UPDATE ON enablement_schedules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. Sessions that were held.
CREATE TABLE enablement_sessions (
  id                bigserial PRIMARY KEY,
  company_id        bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  schedule_id       bigint REFERENCES enablement_schedules(id) ON DELETE SET NULL,
  title             text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  kind              text NOT NULL DEFAULT 'workshop' CHECK (kind IN ('workshop', 'follow_up', 'office_hours', 'other')),
  held_on           date NOT NULL,
  duration_minutes  smallint NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 5 AND 600),
  topics            text CHECK (topics IS NULL OR length(topics) <= 2000),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enablement_sessions_company_idx ON enablement_sessions (company_id, held_on DESC);

-- 4. Who attended, and the skill level they were at after that session (history; the latest is copied to the staff row).
CREATE TABLE enablement_attendance (
  session_id   bigint NOT NULL REFERENCES enablement_sessions(id) ON DELETE CASCADE,
  staff_id     bigint NOT NULL REFERENCES enablement_staff(id) ON DELETE CASCADE,
  level_after  smallint CHECK (level_after BETWEEN 1 AND 3),
  PRIMARY KEY (session_id, staff_id)
);
CREATE INDEX enablement_attendance_staff_idx ON enablement_attendance (staff_id);

-- 5. Skills, prompts and templates handed over. A deliverable can hold pasted text and/or stored files.
CREATE TABLE enablement_deliverables (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_id    bigint REFERENCES enablement_sessions(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('skill', 'prompt', 'template', 'other')),
  title         text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description   text CHECK (description IS NULL OR length(description) <= 600),
  body          text CHECK (body IS NULL OR length(body) <= 20000),
  delivered_on  date NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enablement_deliverables_company_idx ON enablement_deliverables (company_id, delivered_on DESC);

CREATE TABLE enablement_files (
  id              bigserial PRIMARY KEY,
  deliverable_id  bigint NOT NULL REFERENCES enablement_deliverables(id) ON DELETE CASCADE,
  filename        text NOT NULL CHECK (length(filename) BETWEEN 1 AND 200),
  content_type    text NOT NULL,
  size_bytes      integer NOT NULL CHECK (size_bytes > 0),
  data            bytea NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enablement_files_deliverable_idx ON enablement_files (deliverable_id);

-- migrate:down
DROP TABLE enablement_files;
DROP TABLE enablement_deliverables;
DROP TABLE enablement_attendance;
DROP TABLE enablement_sessions;
DROP TABLE enablement_schedules;
DROP TABLE enablement_staff;
