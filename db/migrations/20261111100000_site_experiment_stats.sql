-- migrate:up

-- A snapshot of the public site's split-test counts, copied from the site when the owner clicks "Refresh from site" on /site-tests.
-- Anonymous counts per page version only: no visitor rows, IP addresses, names or emails exist on the site or here.
CREATE TABLE site_experiment_stats (
  experiment text NOT NULL,
  variant    text NOT NULL,
  visitors   integer NOT NULL DEFAULT 0,
  clicks     integer NOT NULL DEFAULT 0,
  scroll75   integer NOT NULL DEFAULT 0,
  booked     integer NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (experiment, variant)
);

-- migrate:down
DROP TABLE site_experiment_stats;
