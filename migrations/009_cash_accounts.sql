BEGIN;

-- Ensure GL account type exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'cash' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'gl_account')) THEN
    ALTER TYPE gl_account ADD VALUE 'cash';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'fee_expense' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'gl_account')) THEN
    ALTER TYPE gl_account ADD VALUE 'fee_expense';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'nsf_fee_income' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'gl_account')) THEN
    ALTER TYPE gl_account ADD VALUE 'nsf_fee_income';
  END IF;
END $$;

CREATE TABLE bank_account (
  bank_acct_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  bank_id TEXT NOT NULL,
  account_number_mask TEXT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  type TEXT NOT NULL CHECK (type IN ('operating','custodial_p_i','escrow','fees')),
  gl_cash_account gl_account NOT NULL DEFAULT 'cash',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ACH origination batches and entries
CREATE TYPE ach_service_class AS ENUM ('200','220','225');
CREATE TYPE ach_txn_code AS ENUM ('22','27','32','37');

CREATE TABLE ach_batch (
  ach_batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_acct_id UUID NOT NULL REFERENCES bank_account(bank_acct_id),
  service_class ach_service_class NOT NULL,
  company_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  effective_entry_date DATE NOT NULL,
  created_by TEXT NOT NULL,
  total_entries INTEGER NOT NULL DEFAULT 0,
  total_amount_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','sealed','filed','settled','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ach_entry (
  ach_entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ach_batch_id UUID NOT NULL REFERENCES ach_batch(ach_batch_id) ON DELETE CASCADE,
  loan_id INTEGER REFERENCES loans(id),
  txn_code ach_txn_code NOT NULL,
  rdfi_routing TEXT NOT NULL,
  dda_account_mask TEXT NOT NULL,
  amount_minor NUMERIC(20,0) NOT NULL CHECK (amount_minor > 0),
  trace_number TEXT UNIQUE,
  addenda TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

-- ACH return notifications
CREATE TABLE ach_return (
  ach_return_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ach_entry_id UUID NOT NULL REFERENCES ach_entry(ach_entry_id),
  return_code TEXT NOT NULL,
  return_date DATE NOT NULL,
  amount_minor NUMERIC(20,0) NOT NULL,
  addenda TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ach_entry_id)
);

-- Bank statements ingestion
CREATE TYPE bank_stmt_format AS ENUM ('bai2','camt.053');

CREATE TABLE bank_statement_file (
  stmt_file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_acct_id UUID NOT NULL REFERENCES bank_account(bank_acct_id),
  format bank_stmt_format NOT NULL,
  as_of_date DATE NOT NULL,
  raw_bytes BYTEA NOT NULL,
  file_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bank_acct_id, as_of_date, file_hash)
);

CREATE TYPE bank_txn_type AS ENUM ('credit','debit','fee','return');

CREATE TABLE bank_txn (
  bank_txn_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stmt_file_id UUID NOT NULL REFERENCES bank_statement_file(stmt_file_id) ON DELETE CASCADE,
  bank_acct_id UUID NOT NULL REFERENCES bank_account(bank_acct_id),
  posted_date DATE NOT NULL,
  value_date DATE,
  amount_minor NUMERIC(20,0) NOT NULL,
  type bank_txn_type NOT NULL,
  bank_ref TEXT,
  description TEXT,
  matched BOOLEAN NOT NULL DEFAULT FALSE,
  matched_event_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Internal match surface
CREATE TABLE cash_match_candidate (
  candidate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_txn_id UUID NOT NULL REFERENCES bank_txn(bank_txn_id) ON DELETE CASCADE,
  event_id UUID,
  score INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exceptions worklist
CREATE TYPE recon_status AS ENUM ('new','investigating','resolved','written_off');

CREATE TABLE recon_exception (
  recon_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_txn_id UUID NOT NULL REFERENCES bank_txn(bank_txn_id) ON DELETE CASCADE,
  variance_minor NUMERIC(20,0) NOT NULL,
  status recon_status NOT NULL DEFAULT 'new',
  assigned_to TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bank_txn_id)
);

-- Create indexes for performance
CREATE INDEX idx_ach_batch_status ON ach_batch(status, created_at);
CREATE INDEX idx_ach_entry_batch ON ach_entry(ach_batch_id);
CREATE INDEX idx_ach_entry_trace ON ach_entry(trace_number) WHERE trace_number IS NOT NULL;
CREATE INDEX idx_bank_txn_matched ON bank_txn(matched, bank_acct_id, posted_date);
CREATE INDEX idx_bank_txn_event ON bank_txn(matched_event_id) WHERE matched_event_id IS NOT NULL;
CREATE INDEX idx_cash_match_bank_txn ON cash_match_candidate(bank_txn_id, score DESC);
CREATE INDEX idx_recon_exception_status ON recon_exception(status, created_at);

COMMIT;