-- Phase 4: Statements, Notices, Documents
BEGIN;

-- Create document type enum
CREATE TYPE document_type AS ENUM ('billing_statement','escrow_analysis','year_end_1098','notice');

-- Document templates for rendering
CREATE TABLE document_template (
  template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type document_type NOT NULL,
  jurisdiction jurisdiction_code,                    -- NULL => global
  version INTEGER NOT NULL,
  engine TEXT NOT NULL CHECK (engine IN ('handlebars-html')),
  html_source TEXT NOT NULL,                         -- full HTML with {{placeholders}}
  css_source TEXT NOT NULL,                          -- CSS chunk (no external fetches)
  font_family TEXT NOT NULL DEFAULT 'DejaVu Sans',   -- pinned for determinism
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, jurisdiction, version)
);

-- Canonical inputs used to render, and the resulting PDF artifact
CREATE TABLE document_artifact (
  doc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type document_type NOT NULL,
  loan_id INTEGER REFERENCES loans(id) ON DELETE SET NULL,
  related_id UUID,                                   -- analysis_id for escrow_analysis; notice_id for notices; NULL for generic
  period_start DATE,                                 -- monthly statements
  period_end DATE,
  tax_year INTEGER,                                  -- 1098
  template_id UUID NOT NULL REFERENCES document_template(template_id),
  payload_json JSONB NOT NULL,                       -- canonical, fully-resolved data (no lookups required)
  inputs_hash CHAR(64) NOT NULL,                     -- sha256(payload_json || template_id || css_source || engine || version)
  pdf_hash CHAR(64) NOT NULL,                        -- sha256(pdf_bytes)
  pdf_bytes BYTEA,                                   -- Phase 4 stores inline; Phase 5 can move to object storage
  size_bytes INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_id UUID,                                     -- event that produced this doc (e.g., docs.generated)
  UNIQUE (type, loan_id, period_start, period_end, tax_year)
);

-- Statement registries for quick search (redundant indices)
CREATE INDEX idx_document_artifact_loan ON document_artifact(loan_id, type, period_start, period_end);
CREATE INDEX idx_document_artifact_hash ON document_artifact(inputs_hash, pdf_hash);

-- Notice templates for Phase 4 (HTML-based, not Word docs)
CREATE TABLE notice_template_v2 (
  notice_template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction jurisdiction_code,
  code TEXT NOT NULL,                   -- e.g., 'LATE_NOTICE_15', 'DEFAULT_LETTER'
  version INTEGER NOT NULL,
  engine TEXT NOT NULL CHECK (engine IN ('handlebars-html')),
  html_source TEXT NOT NULL,
  css_source TEXT NOT NULL,
  subject TEXT NOT NULL,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code, jurisdiction, version)
);

CREATE TYPE notice_status AS ENUM ('scheduled','sent','canceled');

-- Notice scheduling system
CREATE TABLE notice_schedule (
  notice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  notice_template_id UUID NOT NULL REFERENCES notice_template_v2(notice_template_id),
  trigger_code TEXT NOT NULL,                  -- 'LATE_AFTER_GRACE', 'CUSTOM'
  params JSONB NOT NULL DEFAULT '{}',          -- computed variables (e.g., days_late, amount_due)
  scheduled_for TIMESTAMPTZ NOT NULL,          -- exact send time UTC
  status notice_status NOT NULL DEFAULT 'scheduled',
  sent_doc_id UUID REFERENCES document_artifact(doc_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loan_id, notice_template_id, scheduled_for)
);

-- Add borrower TIN for 1098 reporting (critical gap from spec)
ALTER TABLE loans ADD COLUMN IF NOT EXISTS borrower_tin VARCHAR(20);
ALTER TABLE loans ADD COLUMN IF NOT EXISTS co_borrower_tin VARCHAR(20);

-- Create lender entity configuration (critical gap from spec)
CREATE TABLE IF NOT EXISTS lender_entity (
  lender_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT NOT NULL,
  tin TEXT NOT NULL,
  mailing_address JSONB NOT NULL,
  servicing_address JSONB,
  logo_url TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  nmls_number TEXT,
  state_license JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default lender entity (update with real data)
INSERT INTO lender_entity (legal_name, tin, mailing_address, servicing_address) 
VALUES (
  'LoanServe Pro LLC',
  '00-0000000',
  '{"street": "123 Main St", "city": "New York", "state": "NY", "zip": "10001"}',
  '{"street": "123 Main St", "city": "New York", "state": "NY", "zip": "10001"}'
) ON CONFLICT DO NOTHING;

-- Index for notice scheduling
CREATE INDEX idx_notice_schedule_status_time ON notice_schedule(status, scheduled_for) WHERE status = 'scheduled';
CREATE INDEX idx_notice_schedule_loan ON notice_schedule(loan_id, status);

COMMIT;