-- Phase 3: Escrow Subsystem Migration
-- 005_escrow_enums_and_gl.sql
BEGIN;

-- Enums gl_account, jurisdiction_code, and rounding_mode already exist
-- Add any missing values to gl_account if needed
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'gl_account')
    AND enumlabel = 'escrow_advances'
  ) THEN
    ALTER TYPE gl_account ADD VALUE 'escrow_advances';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'gl_account')
    AND enumlabel = 'escrow_refund_payable'
  ) THEN
    ALTER TYPE gl_account ADD VALUE 'escrow_refund_payable';
  END IF;
END $$;

-- Create product_policy table if it doesn't exist
CREATE TABLE IF NOT EXISTS product_policy (
  product_code TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  product_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Policy table for escrow behavior (product x jurisdiction). All caps are enforced here.
CREATE TABLE escrow_policy (
  policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code TEXT NOT NULL REFERENCES product_policy(product_code),
  jurisdiction jurisdiction_code NOT NULL,
  cushion_months SMALLINT NOT NULL CHECK (cushion_months BETWEEN 0 AND 2),
  shortage_amortization_months SMALLINT NOT NULL CHECK (shortage_amortization_months BETWEEN 1 AND 24),
  deficiency_amortization_months SMALLINT NOT NULL CHECK (deficiency_amortization_months BETWEEN 1 AND 24),
  surplus_refund_threshold_minor NUMERIC(20,0) NOT NULL DEFAULT 5000,  -- $50.00 default
  collect_surplus_as_reduction BOOLEAN NOT NULL DEFAULT true,         -- if false, refund surplus to borrower
  pay_when_insufficient BOOLEAN NOT NULL DEFAULT true,                -- advance if escrow balance insufficient
  rounding rounding_mode NOT NULL DEFAULT 'half_away_from_zero',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_code, jurisdiction)
);

-- Forecasted disbursements for the next 12 months (rolling)
CREATE TABLE escrow_forecast (
  forecast_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  escrow_id UUID NOT NULL REFERENCES escrow_items(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  amount_minor NUMERIC(20,0) NOT NULL CHECK (amount_minor > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loan_id, escrow_id, due_date)
);

-- Scheduled and posted disbursements
CREATE TYPE disbursement_status_v2 AS ENUM ('scheduled','posted','canceled');

CREATE TABLE escrow_disbursement (
  disb_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  escrow_id UUID NOT NULL REFERENCES escrow_items(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  amount_minor NUMERIC(20,0) NOT NULL CHECK (amount_minor > 0),
  status disbursement_status_v2 NOT NULL DEFAULT 'scheduled',
  event_id UUID,  -- ledger_event when posted
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at TIMESTAMPTZ,
  UNIQUE (loan_id, escrow_id, due_date)
);

-- Annual analysis header and lines
CREATE TABLE escrow_analysis (
  analysis_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  period_start DATE NOT NULL,      -- analysis projection start (usually as_of_date)
  period_end DATE NOT NULL,        -- +12 months
  annual_expected_minor NUMERIC(20,0) NOT NULL,
  cushion_target_minor NUMERIC(20,0) NOT NULL,
  current_balance_minor NUMERIC(20,0) NOT NULL,   -- sign convention explained below
  shortage_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  deficiency_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  surplus_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  new_monthly_target_minor NUMERIC(20,0) NOT NULL,   -- excludes deficiency recovery
  deficiency_recovery_monthly_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  version INTEGER NOT NULL,           -- increments per loan per run
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loan_id, version)
);

CREATE TABLE escrow_analysis_item (
  analysis_id UUID NOT NULL REFERENCES escrow_analysis(analysis_id) ON DELETE CASCADE,
  escrow_id UUID NOT NULL REFERENCES escrow_items(id) ON DELETE CASCADE,
  forecast_due_date DATE NOT NULL,
  forecast_amount_minor NUMERIC(20,0) NOT NULL,
  PRIMARY KEY (analysis_id, escrow_id, forecast_due_date)
);

-- Generated statement artifact metadata (PDF stored elsewhere per Phase 4)
CREATE TABLE escrow_statement (
  analysis_id UUID PRIMARY KEY REFERENCES escrow_analysis(analysis_id) ON DELETE CASCADE,
  document_hash TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX escrow_policy_product_idx ON escrow_policy(product_code);
CREATE INDEX escrow_policy_jurisdiction_idx ON escrow_policy(jurisdiction);

CREATE INDEX escrow_forecast_loan_idx ON escrow_forecast(loan_id);
CREATE INDEX escrow_forecast_escrow_idx ON escrow_forecast(escrow_id);
CREATE INDEX escrow_forecast_due_date_idx ON escrow_forecast(due_date);

CREATE INDEX escrow_disbursement_loan_idx ON escrow_disbursement(loan_id);
CREATE INDEX escrow_disbursement_escrow_idx ON escrow_disbursement(escrow_id);
CREATE INDEX escrow_disbursement_due_date_idx ON escrow_disbursement(due_date);
CREATE INDEX escrow_disbursement_status_idx ON escrow_disbursement(status);

CREATE INDEX escrow_analysis_loan_idx ON escrow_analysis(loan_id);
CREATE INDEX escrow_analysis_as_of_date_idx ON escrow_analysis(as_of_date);

CREATE INDEX escrow_analysis_item_analysis_idx ON escrow_analysis_item(analysis_id);
CREATE INDEX escrow_analysis_item_escrow_idx ON escrow_analysis_item(escrow_id);

COMMIT;