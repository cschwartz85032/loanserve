BEGIN;

-- 1) Servicing account per loan
CREATE TABLE IF NOT EXISTS svc_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id integer NOT NULL UNIQUE REFERENCES loans(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('Pending','Active','Closed','ChargedOff')) DEFAULT 'Pending',
  open_date date NOT NULL,
  first_payment_date date NOT NULL,
  maturity_date date NOT NULL,
  note_amount numeric(18,2) NOT NULL,
  interest_rate numeric(9,6) NOT NULL,       -- annual nominal rate (percent)
  amort_term_months integer NOT NULL,
  payment_frequency text NOT NULL CHECK (payment_frequency IN ('Monthly')) DEFAULT 'Monthly',
  pmt_principal_interest numeric(18,2) NOT NULL,    -- contractual P&I
  grace_days integer NOT NULL DEFAULT 15,
  day_count text NOT NULL DEFAULT 'Actual/360',
  escrow_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz NULL
);

-- 2) Escrow sub-accounts (TAX, HOI, FLOOD, HOA, OTHER)
CREATE TABLE IF NOT EXISTS svc_escrow_sub (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id integer NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  bucket text NOT NULL CHECK (bucket IN ('TAX','HOI','FLOOD','HOA','OTHER')),
  monthly_accrual numeric(18,2) NOT NULL DEFAULT 0,
  balance numeric(18,2) NOT NULL DEFAULT 0,
  cushion_months integer NOT NULL DEFAULT 2,
  vendor_id uuid NULL,       -- references svc_vendors.id
  UNIQUE (loan_id, bucket)
);

-- 3) Vendors (tax/insurance/hoa payees)
CREATE TABLE IF NOT EXISTS svc_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id integer NULL,               -- vendor may be loan-specific
  type text NOT NULL CHECK (type IN ('TAX','HOI','FLOOD','HOA','OTHER')),
  name text NOT NULL,
  address text NULL,
  phone text NULL,
  email text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4) Amortization schedule (1 row per installment)
CREATE TABLE IF NOT EXISTS svc_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id integer NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  installment_no integer NOT NULL,
  due_date date NOT NULL,
  principal_due numeric(18,2) NOT NULL,
  interest_due numeric(18,2) NOT NULL,
  escrow_due numeric(18,2) NOT NULL DEFAULT 0,
  total_due numeric(18,2) NOT NULL,
  principal_balance_after numeric(18,2) NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz NULL,
  UNIQUE (loan_id, installment_no)
);

-- 5) Transactions (payments/disbursements/adjustments)
CREATE TABLE IF NOT EXISTS svc_txns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id integer NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL CHECK (type IN ('PAYMENT','DISBURSEMENT','ADJUSTMENT','BOARDING')),
  amount numeric(18,2) NOT NULL,       -- signed (positive receipts, negative disbursements)
  currency text NOT NULL DEFAULT 'USD',
  alloc_principal numeric(18,2) NOT NULL DEFAULT 0,
  alloc_interest numeric(18,2) NOT NULL DEFAULT 0,
  alloc_escrow numeric(18,2) NOT NULL DEFAULT 0,
  alloc_fees numeric(18,2) NOT NULL DEFAULT 0,
  memo text NULL,
  ref jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 6) GL postings (double-entry)
CREATE TABLE IF NOT EXISTS gl_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id integer NULL,    -- some entries are portfolio-level
  ts timestamptz NOT NULL DEFAULT now(),
  entry_no bigint GENERATED ALWAYS AS IDENTITY,
  debit_acct integer NOT NULL,
  credit_acct integer NOT NULL,
  amount numeric(18,2) NOT NULL,
  memo text NULL
);

CREATE INDEX IF NOT EXISTS idx_svc_accounts_loan ON svc_accounts(tenant_id, loan_id);
CREATE INDEX IF NOT EXISTS idx_svc_schedule_loan ON svc_schedule(tenant_id, loan_id, due_date);
CREATE INDEX IF NOT EXISTS idx_svc_txns_loan ON svc_txns(tenant_id, loan_id, ts);

COMMIT;