BEGIN;

CREATE TABLE IF NOT EXISTS investor_contract (
  contract_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id TEXT NOT NULL REFERENCES investors(investor_id),
  product_code TEXT NOT NULL REFERENCES product_policy(product_code),
  method TEXT NOT NULL CHECK (method IN ('scheduled_p_i','actual_cash','scheduled_p_i_with_interest_shortfall')),
  remittance_day SMALLINT NOT NULL CHECK (remittance_day BETWEEN 1 AND 31),
  cutoff_day SMALLINT NOT NULL CHECK (cutoff_day BETWEEN 1 AND 31),
  custodial_bank_acct_id UUID NOT NULL REFERENCES bank_account(bank_acct_id),
  servicer_fee_bps INTEGER NOT NULL DEFAULT 0,
  late_fee_split_bps INTEGER NOT NULL DEFAULT 0,  -- portion to investor
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Waterfall configuration
CREATE TABLE IF NOT EXISTS investor_waterfall_rule (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES investor_contract(contract_id) ON DELETE CASCADE,
  rank SMALLINT NOT NULL,       -- order of application
  bucket TEXT NOT NULL CHECK (bucket IN ('interest','principal','late_fees','escrow','recoveries')),
  cap_minor NUMERIC(20,0),      -- optional cap for this bucket
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, rank)
);

-- Remittance cycle
CREATE TYPE remit_status AS ENUM ('open','locked','file_generated','sent','settled','closed');

CREATE TABLE IF NOT EXISTS remittance_cycle (
  cycle_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES investor_contract(contract_id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status remit_status NOT NULL DEFAULT 'open',
  total_principal_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  total_interest_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  total_fees_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  servicer_fee_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  investor_due_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, period_start, period_end)
);

-- Cycle line items (loan-level or pool-level)
CREATE TABLE IF NOT EXISTS remittance_item (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES remittance_cycle(cycle_id) ON DELETE CASCADE,
  loan_id INTEGER REFERENCES loans(id),
  principal_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  interest_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  fees_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  investor_share_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  servicer_fee_minor NUMERIC(20,0) NOT NULL DEFAULT 0
);

-- Export files registry
CREATE TABLE IF NOT EXISTS remittance_export (
  export_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES remittance_cycle(cycle_id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('csv','xml')),
  file_hash CHAR(64) NOT NULL,
  bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GL accounts for investor remittance are handled via ledger_entry account_name column
-- Using account names: investor_payable_principal, investor_payable_interest, servicer_fee_income

COMMIT;