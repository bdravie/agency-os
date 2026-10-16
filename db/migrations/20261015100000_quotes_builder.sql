-- migrate:up
ALTER TABLE quotes
  ADD COLUMN scope             text,
  ADD COLUMN timeline          text,
  ADD COLUMN discount_gbp      numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN subscription_link text,
  ADD COLUMN valid_until       date;

-- migrate:down
ALTER TABLE quotes
  DROP COLUMN scope, DROP COLUMN timeline, DROP COLUMN discount_gbp,
  DROP COLUMN subscription_link, DROP COLUMN valid_until;
