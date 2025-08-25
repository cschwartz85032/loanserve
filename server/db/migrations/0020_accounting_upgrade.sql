-- Migration: Comprehensive Double-Entry Accounting System
-- WARNING: This is a major upgrade. Backup database before running!

BEGIN;

-- ============================================
-- PART 1: Create new types (enums)
-- ============================================

-- Jurisdiction codes (ISO 3166-2 or custom)
CREATE TYPE jurisdiction_code AS ENUM (
  'US_AZ','US_CA','US_TX','US_NY','US_FL','US_CO','US_NV','US_IL','US_WA','US_MA','US_PA','US_GA','US_NC','US_OH','US_MI'
);

-- Loan status types
CREATE TYPE loan_status_v2 AS ENUM (
  'active','matured','paid_off','defaulted','charged_off','in_modification','bankruptcy','foreclosure'
);

-- Interest types
CREATE TYPE interest_type AS ENUM ('fixed','arm','io_then_p_i','interest_only');
CREATE TYPE compounding_method AS ENUM ('simple','compound');
CREATE TYPE day_count_convention AS ENUM ('ACT_365F','ACT_360','US_30_360','EURO_30_360','ACT_ACT');

-- Payment method types
CREATE TYPE payment_method_v2 AS ENUM ('ach','card','wire','check','cash','other');

-- Escrow types
CREATE TYPE escrow_type_v2 AS ENUM ('tax','hazard','flood','mip','pmi','hoa','other');

-- Fee codes
CREATE TYPE fee_code AS ENUM ('late','nsf','deferral','extension','other');

-- Rounding modes
CREATE TYPE rounding_mode AS ENUM ('half_away_from_zero','half_even');

-- General ledger account types for double-entry bookkeeping
CREATE TYPE gl_account AS ENUM (
  -- Asset accounts
  'loan_principal',          -- asset: outstanding principal
  'interest_receivable',     -- asset: accrued but unpaid interest
  'cash',                    -- asset: cash/bank
  'suspense',                -- asset: unapplied/suspense
  'fees_receivable',         -- asset: assessed fees receivable
  -- Liability accounts
  'escrow_liability',        -- liability: owed to payees
  'investor_liability',      -- liability: owed to investors
  -- Income accounts (P&L)
  'interest_income',         -- income: interest earned
  'fee_income',              -- income: late/nsf/other fees
  -- Expense accounts (P&L)
  'writeoff_expense',        -- expense: charge-offs
  'servicing_expense'        -- expense: servicing costs
);

-- ============================================
-- PART 2: Core tables
-- ============================================

-- Product policy configuration
CREATE TABLE IF NOT EXISTS product_policy (
  product_code TEXT PRIMARY KEY,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  rounding rounding_mode NOT NULL DEFAULT 'half_away_from_zero',
  default_day_count day_count_convention NOT NULL DEFAULT 'ACT_365F',
  default_compounding compounding_method NOT NULL DEFAULT 'simple',
  min_payment_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  -- JSONB waterfall array of bucket names in order
  payment_waterfall JSONB NOT NULL DEFAULT '["fees_due","interest_past_due","interest_current","principal","escrow","future"]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rename existing ledger tables to preserve data
ALTER TABLE IF EXISTS ledger_entries RENAME TO ledger_entries_legacy;
ALTER TABLE IF EXISTS ledger_event RENAME TO ledger_event_legacy;

-- New ledger event table (append-only, double-entry)
CREATE TABLE ledger_event (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  schema TEXT NOT NULL,              -- e.g., "posting.payment.v1"
  correlation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ,          -- set by finalize function
  UNIQUE (correlation_id)            -- system-wide idempotency at event-level
);

-- New ledger entry table
CREATE TABLE ledger_entry (
  entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES ledger_event(event_id) ON DELETE CASCADE,
  loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  account gl_account NOT NULL,
  debit_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  credit_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (debit_minor > 0 AND credit_minor = 0) OR
    (credit_minor > 0 AND debit_minor = 0) OR
    (debit_minor = 0 AND credit_minor = 0)
  )
);

CREATE INDEX idx_ledger_entry_loan_date ON ledger_entry(loan_id, created_at);
CREATE INDEX idx_ledger_entry_event ON ledger_entry(event_id);
CREATE INDEX idx_ledger_entry_account ON ledger_entry(account);

-- Loan terms table (effective-dated terms history)
CREATE TABLE loan_terms (
  terms_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  effective_to DATE,                  -- NULL = open-ended
  interest_type interest_type NOT NULL,
  nominal_rate_bps INTEGER NOT NULL CHECK (nominal_rate_bps >= 0), -- annual rate in basis points
  index_name TEXT,                    -- e.g., SOFR, LIBOR
  index_margin_bps INTEGER DEFAULT 0,
  rate_cap_up_bps INTEGER DEFAULT 0,
  rate_cap_down_bps INTEGER DEFAULT 0,
  compounding compounding_method NOT NULL,
  day_count day_count_convention NOT NULL,
  first_payment_date DATE NOT NULL,
  term_months INTEGER NOT NULL CHECK (term_months > 0),
  scheduled_payment_minor NUMERIC(20,0), -- optional; if null, compute
  interest_only_months INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loan_id, effective_from)
);

-- Add exclusion constraint to prevent overlapping terms
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE loan_terms
  ADD CONSTRAINT loan_terms_no_overlap
  EXCLUDE USING gist (
    loan_id WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[)') WITH &&
  );

-- Planning schedule (versioned)
CREATE TABLE schedule_plan (
  plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  terms_id UUID NOT NULL REFERENCES loan_terms(terms_id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (loan_id, version)
);

CREATE TABLE schedule_row (
  plan_id UUID NOT NULL REFERENCES schedule_plan(plan_id) ON DELETE CASCADE,
  period_no INTEGER NOT NULL CHECK (period_no >= 1),
  due_date DATE NOT NULL,
  scheduled_principal_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  scheduled_interest_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  escrow_target_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  fee_target_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  PRIMARY KEY (plan_id, period_no)
);

-- Fee policy (effective-dated, jurisdiction-aware)
CREATE TABLE fee_policy (
  policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code TEXT REFERENCES product_policy(product_code),
  jurisdiction jurisdiction_code NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  late_fee_type TEXT NOT NULL CHECK (late_fee_type IN ('amount','percent')),
  late_fee_amount_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  late_fee_percent_bps INTEGER NOT NULL DEFAULT 0,
  late_fee_grace_days INTEGER NOT NULL DEFAULT 0,
  nsf_fee_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  deferral_fee_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE fee_policy
  ADD CONSTRAINT fee_policy_no_overlap
  EXCLUDE USING gist (
    product_code WITH =,
    jurisdiction WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[)') WITH &&
  );

-- Idempotency keys (fine-grained)
CREATE TABLE IF NOT EXISTS idempotency_key (
  event_type TEXT NOT NULL,
  key TEXT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_type, key)
);

-- Loan accounting configuration
CREATE TABLE loan_accounting_config (
  loan_id INTEGER PRIMARY KEY REFERENCES loans(id) ON DELETE CASCADE,
  product_code TEXT REFERENCES product_policy(product_code),
  jurisdiction jurisdiction_code NOT NULL DEFAULT 'US_CA',
  servicing_type TEXT NOT NULL DEFAULT 'primary',
  lien_position SMALLINT NOT NULL DEFAULT 1 CHECK (lien_position BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- PART 3: Stored procedures for safe posting
-- ============================================

-- Sum check + finalize event. Fails if not balanced or already finalized.
CREATE OR REPLACE FUNCTION sp_finalize_ledger_event(p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  tot_debit NUMERIC(20,0);
  tot_credit NUMERIC(20,0);
  is_final TIMESTAMPTZ;
BEGIN
  SELECT finalized_at INTO is_final FROM ledger_event WHERE event_id = p_event_id FOR UPDATE;
  IF is_final IS NOT NULL THEN
    RAISE EXCEPTION 'Event % already finalized', p_event_id;
  END IF;

  SELECT COALESCE(SUM(debit_minor),0), COALESCE(SUM(credit_minor),0)
  INTO tot_debit, tot_credit
  FROM ledger_entry WHERE event_id = p_event_id;

  IF tot_debit IS NULL OR tot_credit IS NULL OR tot_debit = 0 OR tot_credit = 0 THEN
    RAISE EXCEPTION 'Event % has no entries', p_event_id;
  END IF;

  IF tot_debit <> tot_credit THEN
    RAISE EXCEPTION 'Event % is unbalanced: debit % credit %', p_event_id, tot_debit, tot_credit;
  END IF;

  UPDATE ledger_event SET finalized_at = now() WHERE event_id = p_event_id;
END;
$$;

-- Guard: forbid inserts after finalize
CREATE OR REPLACE FUNCTION trg_forbid_after_finalize()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE f TIMESTAMPTZ;
BEGIN
  SELECT finalized_at INTO f FROM ledger_event WHERE event_id = NEW.event_id;
  IF f IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot insert ledger_entry into finalized event %', NEW.event_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ledger_entry_forbid_after_finalize
BEFORE INSERT ON ledger_entry
FOR EACH ROW EXECUTE FUNCTION trg_forbid_after_finalize();

-- Helper function to get latest loan balances
CREATE OR REPLACE FUNCTION get_loan_balances(p_loan_id INTEGER)
RETURNS TABLE (
  principal_minor NUMERIC(20,0),
  interest_receivable_minor NUMERIC(20,0),
  escrow_liability_minor NUMERIC(20,0),
  fees_receivable_minor NUMERIC(20,0),
  cash_minor NUMERIC(20,0)
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN account = 'loan_principal' THEN debit_minor - credit_minor ELSE 0 END), 0) AS principal_minor,
    COALESCE(SUM(CASE WHEN account = 'interest_receivable' THEN debit_minor - credit_minor ELSE 0 END), 0) AS interest_receivable_minor,
    COALESCE(SUM(CASE WHEN account = 'escrow_liability' THEN credit_minor - debit_minor ELSE 0 END), 0) AS escrow_liability_minor,
    COALESCE(SUM(CASE WHEN account = 'fees_receivable' THEN debit_minor - credit_minor ELSE 0 END), 0) AS fees_receivable_minor,
    COALESCE(SUM(CASE WHEN account = 'cash' THEN debit_minor - credit_minor ELSE 0 END), 0) AS cash_minor
  FROM ledger_entry
  WHERE loan_id = p_loan_id
    AND event_id IN (SELECT event_id FROM ledger_event WHERE finalized_at IS NOT NULL);
END;
$$;

-- ============================================
-- PART 4: Default data
-- ============================================

-- Insert default product policies
INSERT INTO product_policy (product_code, currency, rounding, default_day_count, default_compounding, min_payment_minor, payment_waterfall)
VALUES 
  ('FIXED_30', 'USD', 'half_away_from_zero', 'ACT_365F', 'simple', 10000, '["fees_due","interest_past_due","interest_current","principal","escrow","future"]'),
  ('FIXED_15', 'USD', 'half_away_from_zero', 'ACT_365F', 'simple', 10000, '["fees_due","interest_past_due","interest_current","principal","escrow","future"]'),
  ('ARM_5_1', 'USD', 'half_away_from_zero', 'ACT_365F', 'simple', 10000, '["fees_due","interest_past_due","interest_current","principal","escrow","future"]'),
  ('IO_10', 'USD', 'half_away_from_zero', 'ACT_365F', 'simple', 5000, '["fees_due","interest_past_due","interest_current","escrow","principal","future"]')
ON CONFLICT (product_code) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_loan_terms_loan_id ON loan_terms(loan_id);
CREATE INDEX IF NOT EXISTS idx_schedule_plan_loan_id ON schedule_plan(loan_id);
CREATE INDEX IF NOT EXISTS idx_ledger_event_loan_id ON ledger_event(loan_id);
CREATE INDEX IF NOT EXISTS idx_ledger_event_effective_date ON ledger_event(effective_date);
CREATE INDEX IF NOT EXISTS idx_ledger_event_correlation_id ON ledger_event(correlation_id);

COMMIT;