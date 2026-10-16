-- migrate:up
-- Companies House filing health and size signals (company-level data only), plus a ranking aid.
ALTER TABLE companies
  ADD COLUMN incorporated_on          date,
  ADD COLUMN ch_checked_at            timestamptz,
  ADD COLUMN ch_status_detail         text,
  ADD COLUMN confirmation_overdue     boolean,
  ADD COLUMN confirmation_next_due    date,
  ADD COLUMN accounts_overdue         boolean,
  ADD COLUMN accounts_next_due        date,
  ADD COLUMN accounts_type            text,
  ADD COLUMN last_accounts_date       date,
  ADD COLUMN has_insolvency_history   boolean,
  ADD COLUMN filing_ok                boolean,
  ADD COLUMN employees                integer,
  ADD COLUMN turnover_gbp             numeric(14,2),
  ADD COLUMN net_assets_gbp           numeric(14,2),
  ADD COLUMN cash_gbp                 numeric(14,2),
  ADD COLUMN est_revenue_gbp          numeric(14,2),
  ADD COLUMN est_revenue_basis        text,
  ADD COLUMN fit_score                smallint,
  ADD COLUMN fit_notes                text;
CREATE INDEX companies_filing_fit_idx ON companies (filing_ok, fit_score DESC);

-- migrate:down
DROP INDEX companies_filing_fit_idx;
ALTER TABLE companies
  DROP COLUMN incorporated_on, DROP COLUMN ch_checked_at, DROP COLUMN ch_status_detail, DROP COLUMN confirmation_overdue,
  DROP COLUMN confirmation_next_due, DROP COLUMN accounts_overdue, DROP COLUMN accounts_next_due, DROP COLUMN accounts_type,
  DROP COLUMN last_accounts_date, DROP COLUMN has_insolvency_history, DROP COLUMN filing_ok, DROP COLUMN employees,
  DROP COLUMN turnover_gbp, DROP COLUMN net_assets_gbp, DROP COLUMN cash_gbp, DROP COLUMN est_revenue_gbp,
  DROP COLUMN est_revenue_basis, DROP COLUMN fit_score, DROP COLUMN fit_notes;
