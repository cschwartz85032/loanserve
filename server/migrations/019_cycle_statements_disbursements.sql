BEGIN;

-- 1) Cycle runs (idempotency for daily engine)
CREATE TABLE IF NOT EXISTS svc_cycle_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  as_of_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('started','completed','failed')) DEFAULT 'started',
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  UNIQUE (tenant_id, as_of_date)
);

-- 2) Monthly statements
CREATE TABLE IF NOT EXISTS svc_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id integer NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  statement_date date NOT NULL,
  cycle_label text NOT NULL,                -- e.g. 2025-10
  file_uri text NOT NULL,
  file_sha256 text NOT NULL,
  summary jsonb NOT NULL,                   -- balances, due amounts, delinquency, escrow, shortage etc.
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, cycle_label)
);

-- 3) Vendor bills (escrow payees)
CREATE TABLE IF NOT EXISTS svc_vendor_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id integer NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL,
  bucket text NOT NULL CHECK (bucket IN ('TAX','HOI','FLOOD','HOA','OTHER')),
  due_date date NOT NULL,
  amount numeric(18,2) NOT NULL,
  status text NOT NULL CHECK (status IN ('Queued','Scheduled','Paid','Failed','Cancelled')) DEFAULT 'Queued',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4) Disbursements (outgoing payments)
CREATE TABLE IF NOT EXISTS svc_disbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id integer NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  vendor_id uuid NULL,                      -- escrow payees have a vendor; others may not
  bill_id uuid NULL,                        -- optional link to vendor bill
  method text NOT NULL CHECK (method IN ('ACH','CHECK','WEBHOOK')),
  scheduled_date date NOT NULL,
  amount numeric(18,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL CHECK (status IN ('Requested','Sent','Settled','Failed','Cancelled')) DEFAULT 'Requested',
  reference text NULL,                      -- ACH trace / check #
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL,
  settled_at timestamptz NULL
);

-- 5) Fees — record late fee assessments as txns with type FEE
ALTER TABLE svc_txns
  ADD COLUMN IF NOT EXISTS fee_code text NULL;  -- e.g., LATE

CREATE INDEX IF NOT EXISTS idx_stmt_loan ON svc_statements(tenant_id, loan_id, statement_date);
CREATE INDEX IF NOT EXISTS idx_bills_loan ON svc_vendor_bills(tenant_id, loan_id, due_date);
CREATE INDEX IF NOT EXISTS idx_disb_loan ON svc_disbursements(tenant_id, loan_id, scheduled_date);

COMMIT;