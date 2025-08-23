-- =====================================================================
-- Payment Processing Foundation Migration
-- Phase 2: Production-Ready Schema with Enforced Invariants
-- =====================================================================

-- Reference tables
CREATE TABLE IF NOT EXISTS currency_codes(
  code CHAR(3) PRIMARY KEY
);
INSERT INTO currency_codes(code) VALUES ('USD') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS accounts_chart (
  account VARCHAR(50) PRIMARY KEY,
  account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('asset','liability','income','expense','equity'))
);

-- Insert standard accounts
INSERT INTO accounts_chart(account, account_type) VALUES
  ('cash', 'asset'),
  ('principal_receivable', 'asset'),
  ('interest_receivable', 'asset'),
  ('escrow_tax', 'liability'),
  ('escrow_insurance', 'liability'),
  ('escrow_mi', 'liability'),
  ('interest_income', 'income'),
  ('servicing_fee_income', 'income'),
  ('late_fee_income', 'income'),
  ('unapplied_funds', 'liability')
ON CONFLICT DO NOTHING;

-- Core payment transactions table
CREATE TABLE IF NOT EXISTS payment_transactions (
  payment_id VARCHAR(26) PRIMARY KEY, -- ULID
  loan_id VARCHAR(50) NOT NULL,
  source VARCHAR(20) NOT NULL,
  external_ref VARCHAR(100),
  amount_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  received_at TIMESTAMPTZ NOT NULL,
  effective_date DATE NOT NULL,
  state VARCHAR(30) NOT NULL,
  idempotency_key VARCHAR(200) UNIQUE NOT NULL,
  created_by VARCHAR(100),
  metadata JSONB,
  
  CONSTRAINT chk_positive_amount CHECK (amount_cents > 0),
  CONSTRAINT fk_payment_tx_currency FOREIGN KEY (currency) REFERENCES currency_codes(code),
  CONSTRAINT chk_state_valid CHECK (state IN (
    'received','accepted_for_review','validated','posted_pending_settlement',
    'processing','settled','returned','reversed','rejected','closed'
  )),
  CONSTRAINT chk_source_valid CHECK (source IN (
    'ach','wire','check','card','lockbox','cashier','money_order'
  ))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_tx_loan_state ON payment_transactions(loan_id, state, received_at);
CREATE INDEX IF NOT EXISTS idx_payment_tx_source_ref ON payment_transactions(source, external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_tx_idempotency ON payment_transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_payment_tx_effective ON payment_transactions(effective_date);

-- Double-entry ledger with one-sided constraint
CREATE TABLE IF NOT EXISTS payment_ledger (
  ledger_id BIGSERIAL PRIMARY KEY,
  loan_id VARCHAR(50) NOT NULL,
  payment_id VARCHAR(26) NOT NULL,
  account VARCHAR(50) NOT NULL,
  debit_cents BIGINT NOT NULL DEFAULT 0,
  credit_cents BIGINT NOT NULL DEFAULT 0,
  pending BOOLEAN NOT NULL DEFAULT true,
  effective_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversal_of BIGINT, -- Links to original entry if this is a reversal
  
  CONSTRAINT chk_one_sided CHECK (
    (debit_cents > 0 AND credit_cents = 0) OR
    (credit_cents > 0 AND debit_cents = 0)
  ),
  CONSTRAINT fk_ledger_payment FOREIGN KEY (payment_id) REFERENCES payment_transactions(payment_id),
  CONSTRAINT fk_ledger_account FOREIGN KEY (account) REFERENCES accounts_chart(account),
  CONSTRAINT fk_ledger_reversal FOREIGN KEY (reversal_of) REFERENCES payment_ledger(ledger_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_ledger_loan ON payment_ledger(loan_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_payment ON payment_ledger(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_pending ON payment_ledger(pending) WHERE pending = true;

-- Escrow sub-accounts with categories
CREATE TABLE IF NOT EXISTS escrow_accounts (
  loan_id VARCHAR(50) NOT NULL,
  category VARCHAR(20) NOT NULL,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  target_balance_cents BIGINT,
  cushion_cents BIGINT,
  shortage_cents BIGINT NOT NULL DEFAULT 0,
  last_analysis_date DATE,
  next_analysis_date DATE,
  
  PRIMARY KEY (loan_id, category),
  CONSTRAINT chk_escrow_cat CHECK (category IN ('tax','hazard','flood','MI'))
);

-- Escrow ledger for tracking contributions and disbursements
CREATE TABLE IF NOT EXISTS escrow_ledger (
  ledger_id BIGSERIAL PRIMARY KEY,
  loan_id VARCHAR(50) NOT NULL,
  payment_id VARCHAR(26),
  category VARCHAR(20) NOT NULL,
  debit_cents BIGINT NOT NULL DEFAULT 0,
  credit_cents BIGINT NOT NULL DEFAULT 0,
  effective_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_escrow_one_sided CHECK (
    (debit_cents > 0 AND credit_cents = 0) OR
    (credit_cents > 0 AND debit_cents = 0)
  ),
  CONSTRAINT fk_escrow_ledger_payment FOREIGN KEY (payment_id) REFERENCES payment_transactions(payment_id)
);

-- Investor ownership versions (enforces 100% ownership)
CREATE TABLE IF NOT EXISTS investor_position_versions (
  version_id VARCHAR(26) PRIMARY KEY, -- ULID
  loan_id VARCHAR(50) NOT NULL,
  effective_from DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(100),
  
  UNIQUE (loan_id, effective_from)
);

-- Investor positions (must sum to 10000 bps per version)
CREATE TABLE IF NOT EXISTS investor_positions (
  version_id VARCHAR(26) NOT NULL,
  investor_id VARCHAR(50) NOT NULL,
  pct_bps INTEGER NOT NULL, -- basis points (0..10000)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (version_id, investor_id),
  CONSTRAINT fk_ip_version FOREIGN KEY (version_id) REFERENCES investor_position_versions(version_id) ON DELETE CASCADE,
  CONSTRAINT chk_pct_bps CHECK (pct_bps BETWEEN 0 AND 10000)
);

-- View for resolved effective dates
CREATE OR REPLACE VIEW investor_position_versions_resolved AS
SELECT
  ipv.loan_id,
  ipv.version_id,
  ipv.effective_from,
  LEAD(ipv.effective_from) OVER (PARTITION BY ipv.loan_id ORDER BY ipv.effective_from) AS effective_to
FROM investor_position_versions ipv;

-- Distribution records
CREATE TABLE IF NOT EXISTS payment_distributions (
  distribution_id BIGSERIAL PRIMARY KEY,
  payment_id VARCHAR(26) NOT NULL,
  investor_id VARCHAR(50) NOT NULL,
  amount_cents BIGINT NOT NULL,
  servicing_fee_cents BIGINT NOT NULL DEFAULT 0,
  tranche VARCHAR(20),
  effective_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL,
  clawback_id VARCHAR(26),
  
  CONSTRAINT fk_distrib_payment FOREIGN KEY (payment_id) REFERENCES payment_transactions(payment_id),
  CONSTRAINT chk_distrib_status CHECK (status IN (
    'calculated','posted','clawback_pending','clawback_netted','receivable'
  ))
);

CREATE INDEX IF NOT EXISTS idx_distrib_payment ON payment_distributions(payment_id);
CREATE INDEX IF NOT EXISTS idx_distrib_investor ON payment_distributions(investor_id, status);

-- Payment state transitions audit log
CREATE TABLE IF NOT EXISTS payment_state_transitions (
  id BIGSERIAL PRIMARY KEY,
  payment_id VARCHAR(26) NOT NULL REFERENCES payment_transactions(payment_id),
  previous_state VARCHAR(30),
  new_state VARCHAR(30) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT,
  reason TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_payment_transitions ON payment_state_transitions(payment_id, occurred_at);

-- Idempotent consumer inbox
CREATE TABLE IF NOT EXISTS inbox (
  consumer VARCHAR(100) NOT NULL,
  message_id VARCHAR(26) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result_hash TEXT,
  
  PRIMARY KEY (consumer, message_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_processed ON inbox(processed_at);

-- Transactional outbox for event publishing
CREATE TABLE IF NOT EXISTS outbox (
  id BIGSERIAL PRIMARY KEY,
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id VARCHAR(50) NOT NULL,
  schema TEXT NOT NULL,
  routing_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  publish_attempts INTEGER DEFAULT 0,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_unpublished ON outbox(published_at) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON outbox(aggregate_type, aggregate_id);

-- Payment allocation rules configuration
CREATE TABLE IF NOT EXISTS allocation_rules (
  loan_id VARCHAR(50) NOT NULL,
  priority INTEGER NOT NULL,
  target VARCHAR(50) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  
  PRIMARY KEY (loan_id, priority),
  CONSTRAINT chk_allocation_target CHECK (target IN (
    'late_fees','accrued_interest','scheduled_principal',
    'escrow_shortage','current_escrow','unapplied_funds'
  ))
);

-- ACH return window tracking
CREATE TABLE IF NOT EXISTS ach_return_windows (
  payment_id VARCHAR(26) PRIMARY KEY REFERENCES payment_transactions(payment_id),
  return_code_class VARCHAR(20) NOT NULL,
  window_expires_at TIMESTAMPTZ NOT NULL,
  probe_scheduled BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_ach_windows_expires ON ach_return_windows(window_expires_at) WHERE probe_scheduled = false;

-- =====================================================================
-- TRIGGER: Enforce investor ownership sum = 100% (10,000 bps)
-- =====================================================================

CREATE OR REPLACE FUNCTION trg_check_investor_positions_sum()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v RECORD;
  bad RECORD;
BEGIN
  -- Collect affected version_ids
  FOR v IN
    SELECT DISTINCT version_id FROM (
      SELECT version_id FROM new_table
      UNION
      SELECT version_id FROM old_table
    ) x
  LOOP
    SELECT
      version_id,
      COALESCE(SUM(pct_bps),0) AS sum_bps,
      COUNT(*) AS cnt
    INTO bad
    FROM investor_positions
    WHERE version_id = v.version_id
    GROUP BY version_id;

    -- Require at least one row and exactly 10000 bps (100%)
    IF bad.cnt IS NULL OR bad.cnt = 0 OR bad.sum_bps <> 10000 THEN
      RAISE EXCEPTION 'Investor positions for version % must sum to exactly 10000 bps (100%%). Got % bps with % investors',
        v.version_id, COALESCE(bad.sum_bps,0), COALESCE(bad.cnt,0)
        USING ERRCODE = '23514'; -- check_violation
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_positions_sum ON investor_positions;
CREATE TRIGGER trg_positions_sum
AFTER INSERT OR UPDATE OR DELETE ON investor_positions
REFERENCING NEW TABLE AS new_table OLD TABLE AS old_table
FOR EACH STATEMENT
EXECUTE FUNCTION trg_check_investor_positions_sum();

-- =====================================================================
-- FUNCTION: Get loan advisory lock for serialization
-- =====================================================================

CREATE OR REPLACE FUNCTION acquire_loan_lock(p_loan_id VARCHAR)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Use advisory lock on hash of loan_id
  PERFORM pg_advisory_lock(hashtext(p_loan_id));
END;
$$;

CREATE OR REPLACE FUNCTION release_loan_lock(p_loan_id VARCHAR)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_unlock(hashtext(p_loan_id));
END;
$$;

-- =====================================================================
-- Sample allocation rules for testing
-- =====================================================================

-- Default allocation order (can be customized per loan)
INSERT INTO allocation_rules (loan_id, priority, target, enabled) VALUES
  ('DEFAULT', 1, 'late_fees', true),
  ('DEFAULT', 2, 'accrued_interest', true),
  ('DEFAULT', 3, 'scheduled_principal', true),
  ('DEFAULT', 4, 'escrow_shortage', true),
  ('DEFAULT', 5, 'current_escrow', true),
  ('DEFAULT', 6, 'unapplied_funds', true)
ON CONFLICT DO NOTHING;