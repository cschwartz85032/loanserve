-- Phase 7: Investor Remittance and Reporting
BEGIN;

-- Investor contract configuration
CREATE TABLE investor_contract (
  contract_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id INTEGER NOT NULL REFERENCES investors(id),
  product_code TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('scheduled_p_i','actual_cash','scheduled_p_i_with_interest_shortfall')),
  remittance_day SMALLINT NOT NULL CHECK (remittance_day BETWEEN 1 AND 31),
  cutoff_day SMALLINT NOT NULL CHECK (cutoff_day BETWEEN 1 AND 31),
  custodial_bank_acct_id UUID NOT NULL REFERENCES bank_account(bank_acct_id),
  servicer_fee_bps INTEGER NOT NULL DEFAULT 0,
  late_fee_split_bps INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Waterfall configuration
CREATE TABLE investor_waterfall_rule (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES investor_contract(contract_id) ON DELETE CASCADE,
  rank SMALLINT NOT NULL,
  bucket TEXT NOT NULL CHECK (bucket IN ('interest','principal','late_fees','escrow','recoveries')),
  cap_minor NUMERIC(20,0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, rank)
);

-- Remittance status enum
CREATE TYPE remit_status AS ENUM ('open','locked','file_generated','sent','settled','closed');

-- Remittance cycle
CREATE TABLE remittance_cycle (
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
  locked_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  UNIQUE (contract_id, period_start, period_end)
);

CREATE INDEX idx_remittance_cycle_status ON remittance_cycle(status);
CREATE INDEX idx_remittance_cycle_period ON remittance_cycle(period_start, period_end);

-- Cycle line items (loan-level details)
CREATE TABLE remittance_item (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES remittance_cycle(cycle_id) ON DELETE CASCADE,
  loan_id INTEGER REFERENCES loans(id),
  principal_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  interest_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  fees_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  investor_share_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  servicer_fee_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_remittance_item_cycle ON remittance_item(cycle_id);
CREATE INDEX idx_remittance_item_loan ON remittance_item(loan_id);

-- Export files registry
CREATE TABLE remittance_export (
  export_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES remittance_cycle(cycle_id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('csv','xml')),
  file_hash CHAR(64) NOT NULL,
  bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_remittance_export_cycle ON remittance_export(cycle_id);

-- Reconciliation snapshots
CREATE TABLE remittance_recon_snapshot (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES remittance_cycle(cycle_id),
  gl_principal_variance_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  gl_interest_variance_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  gl_fee_variance_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reconciled_by TEXT NOT NULL
);

-- GL accounts will be added through the ledger system

COMMIT;