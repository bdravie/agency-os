-- migrate:up
-- Process diagrams drawn in the CRM's flowchart builder: Mermaid code plus the theme to draw it in. The CRM has one user, so there is no account column,
-- the same as every other table. Syntax is not checked here because Mermaid's parser needs a browser and unfinished work is saved as it is typed.
-- Business processes only: the app refuses email addresses and phone numbers (crm/lib/flowchartMath.ts).
CREATE TABLE flowcharts (
  id         bigserial PRIMARY KEY,
  title      text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  code       text NOT NULL CHECK (char_length(code) <= 50000),
  theme      text NOT NULL DEFAULT 'auto' CHECK (theme IN ('auto', 'default', 'neutral', 'dark', 'forest')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX flowcharts_updated_at_idx ON flowcharts (updated_at DESC);
CREATE TRIGGER flowcharts_updated_at BEFORE UPDATE ON flowcharts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- migrate:down
DROP TABLE flowcharts;
