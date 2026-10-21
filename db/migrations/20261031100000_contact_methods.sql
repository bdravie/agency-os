-- migrate:up

-- Extra ways to reach a company beyond the main contact boxes: TikTok, YouTube, X, other social pages, a secondary email or phone, WhatsApp.
-- Company-level only (the app refuses personal addresses and named people).
CREATE TABLE company_contact_methods (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('tiktok', 'youtube', 'x', 'social_other', 'whatsapp', 'email_secondary', 'phone_secondary', 'other')),
  value       text NOT NULL,
  note        text,
  source      text,                          -- 'manual' or 'auto-search'
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX company_contact_methods_uniq ON company_contact_methods (company_id, kind, lower(value));
CREATE INDEX company_contact_methods_company_idx ON company_contact_methods (company_id);

-- migrate:down
-- Intentionally empty: never roll back the business database. Write a new migration instead.
