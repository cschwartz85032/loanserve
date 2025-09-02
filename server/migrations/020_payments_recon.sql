BEGIN;

-- Payment batches (lockbox/ACH/day)
CREATE TABLE IF NOT EXISTS pay_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('ACH','CARD','LOCKBOX','MANUAL')),
  batch_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('Open','Posted','Reconciled','Failed')) DEFAULT 'Open',
  file_uri text NULL,           -- lockbox csv or bank file
  file_sha256 text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz NULL,
  reconciled_at timestamptz NULL
);

-- Payments (raw intake before/after posting)
CREATE TABLE IF NOT EXISTS pay_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  batch_id uuid NULL REFERENCES pay_batches(id) ON DELETE SET NULL,
  loan_id integer NULL REFERENCES loans(id) ON DELETE SET NULL,
  loan_number text NULL,                         -- used to route if loan_id missing
  ts timestamptz NOT NULL DEFAULT now(),
  amount numeric(18,2) NOT NULL,
  channel text NOT NULL CHECK (channel IN ('ACH','CARD','LOCKBOX','MANUAL')),
  reference text NULL,
  memo text NULL,
  status text NOT NULL CHECK (status IN ('Received','Validated','Posted','Suspense','Rejected','Reversed')) DEFAULT 'Received',
  error text NULL,
  alloc jsonb NOT NULL DEFAULT '{}'::jsonb,      -- {principal,interest,escrow,fees,leftover}
  posted_txn_id uuid NULL,                       -- svc_txns.id for posting
  receipt_id uuid NULL
);

-- Suspense (per loan)
CREATE TABLE IF NOT EXISTS pay_suspense (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id integer NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  balance numeric(18,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, loan_id)
);

-- Receipts (PDFs)
CREATE TABLE IF NOT EXISTS pay_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id integer NOT NULL,
  payment_id uuid NOT NULL REFERENCES pay_payments(id) ON DELETE CASCADE,
  file_uri text NOT NULL,
  file_sha256 text NOT NULL,
  summary jsonb NOT NULL,                          -- allocations etc
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Bank reconciliation (statement imports & matching)
CREATE TABLE IF NOT EXISTS recon_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  stmt_date date NOT NULL,
  opening_balance numeric(18,2) NOT NULL,
  closing_balance numeric(18,2) NOT NULL,
  file_uri text NOT NULL,
  file_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recon_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bank_id uuid NOT NULL REFERENCES recon_bank(id) ON DELETE CASCADE,
  payment_id uuid NULL REFERENCES pay_payments(id) ON DELETE SET NULL,
  txn_id uuid NULL REFERENCES svc_txns(id) ON DELETE SET NULL,
  amount numeric(18,2) NOT NULL,
  status text NOT NULL CHECK (status IN ('Auto','Manual','Reviewed')) DEFAULT 'Auto',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_loan ON pay_payments(tenant_id, loan_id, ts);
CREATE INDEX IF NOT EXISTS idx_suspense_loan ON pay_suspense(tenant_id, loan_id);
CREATE INDEX IF NOT EXISTS idx_batches_date ON pay_batches(tenant_id, batch_date, channel);

COMMIT;