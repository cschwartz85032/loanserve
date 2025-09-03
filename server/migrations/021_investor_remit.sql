BEGIN;

-- 1) Investors
CREATE TABLE IF NOT EXISTS inv_investors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  delivery_type text NOT NULL CHECK (delivery_type IN ('WHOLE_LOAN','PARTICIPATION')),
  webhook_url text NULL,
  webhook_secret text NULL,
  currency text NOT NULL DEFAULT 'USD',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Investor-loan mapping (+ overrides)
CREATE TABLE IF NOT EXISTS inv_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  investor_id uuid NOT NULL REFERENCES inv_investors(id) ON DELETE CASCADE,
  loan_id integer NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  participation_pct numeric(9,6) NOT NULL DEFAULT 1.0,              -- 1.0 = 100%
  svc_fee_bps integer NULL,                                         -- override REMIT_SVC_FEE_BPS
  strip_bps integer NULL,                                           -- override REMIT_STRIP_BPS
  pass_escrow boolean NULL,                                         -- override REMIT_PASS_ESCROW
  accrual_basis text NOT NULL DEFAULT '30/360',                      -- display only for statement
  active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, investor_id, loan_id)
);

-- 3) Remittance runs (periods)
CREATE TABLE IF NOT EXISTS inv_remit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  investor_id uuid NOT NULL REFERENCES inv_investors(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL CHECK (status IN ('Started','Completed','Failed')) DEFAULT 'Started',
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  UNIQUE (tenant_id, investor_id, period_start, period_end)
);

-- 4) Line items (loan-level aggregates)
CREATE TABLE IF NOT EXISTS inv_remit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES inv_remit_runs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  investor_id uuid NOT NULL,
  loan_id integer NOT NULL,
  upb_beg numeric(18,2) NOT NULL DEFAULT 0,
  upb_end numeric(18,2) NOT NULL DEFAULT 0,
  principal_collected numeric(18,2) NOT NULL DEFAULT 0,
  interest_collected numeric(18,2) NOT NULL DEFAULT 0,
  escrow_collected numeric(18,2) NOT NULL DEFAULT 0,
  fees_collected numeric(18,2) NOT NULL DEFAULT 0,
  svc_fee numeric(18,2) NOT NULL DEFAULT 0,
  strip_io numeric(18,2) NOT NULL DEFAULT 0,
  net_remit numeric(18,2) NOT NULL DEFAULT 0
);

-- 5) Payouts (per run)
CREATE TABLE IF NOT EXISTS inv_remit_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  investor_id uuid NOT NULL,
  run_id uuid NOT NULL REFERENCES inv_remit_runs(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  method text NOT NULL CHECK (method IN ('ACH','WIRE','WEBHOOK')) DEFAULT 'ACH',
  status text NOT NULL CHECK (status IN ('Requested','Sent','Settled','Failed','Cancelled')) DEFAULT 'Requested',
  reference text NULL,
  file_uri text NULL,                   -- remittance file (CSV / NACHA stub)
  file_sha256 text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL,
  settled_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_inv_holdings_loan ON inv_holdings(tenant_id, loan_id, active);
CREATE INDEX IF NOT EXISTS idx_inv_runs_inv ON inv_remit_runs(tenant_id, investor_id, period_end DESC);

COMMIT;