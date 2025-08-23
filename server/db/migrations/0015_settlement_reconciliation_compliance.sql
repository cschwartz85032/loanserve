-- Phase 3: Settlement, Reconciliation, Compliance, and AML Schema
-- Enterprise-grade bank-agnostic settlement and compliance infrastructure

-- Bank files for ingesting statements and settlement artifacts
CREATE TABLE IF NOT EXISTS bank_files (
  file_id        BIGSERIAL PRIMARY KEY,
  source_system  TEXT NOT NULL,
  format         TEXT NOT NULL,           -- BAI2, MT940, NACHA_RET, CAMT.053
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  business_date  DATE NOT NULL,
  sha256         BYTEA NOT NULL UNIQUE,
  row_count      INT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'ingested',  -- ingested, parsed, reconciled, failed
  error_reason   TEXT
);

-- External bank transactions from parsed files
CREATE TABLE IF NOT EXISTS bank_transactions (
  ext_tx_id      TEXT PRIMARY KEY,
  file_id        BIGINT REFERENCES bank_files(file_id),
  bank_account   TEXT NOT NULL,
  posted_at      TIMESTAMPTZ NOT NULL,
  amount_cents   BIGINT NOT NULL,
  currency       CHAR(3) NOT NULL DEFAULT 'USD',
  type           TEXT NOT NULL,           -- credit, debit, return, fee
  method         TEXT NOT NULL,           -- ach, wire, check, card, rtp
  ext_reference  TEXT,
  counterparty   TEXT,
  memo           TEXT
);

-- Expected settlements for tracking what we're waiting for
CREATE TABLE IF NOT EXISTS expected_settlements (
  expect_id      BIGSERIAL PRIMARY KEY,
  payment_id     VARCHAR(26) NOT NULL,
  loan_id        VARCHAR(50) NOT NULL,
  method         TEXT NOT NULL,
  direction      TEXT NOT NULL,           -- inbound, outbound, refund, investor_payout
  amount_cents   BIGINT NOT NULL,
  currency       CHAR(3) NOT NULL DEFAULT 'USD',
  initiated_at   TIMESTAMPTZ NOT NULL,
  effective_date DATE NOT NULL,
  ext_ref_hint   TEXT,
  state          TEXT NOT NULL DEFAULT 'pending', -- pending, settled, returned, partial, failed
  UNIQUE(payment_id, method, direction)
);

-- Reconciliation matches between bank transactions and expectations
CREATE TABLE IF NOT EXISTS reconciliation_matches (
  match_id       BIGSERIAL PRIMARY KEY,
  ext_tx_id      TEXT REFERENCES bank_transactions(ext_tx_id),
  expect_id      BIGINT REFERENCES expected_settlements(expect_id),
  score          NUMERIC(5,2) NOT NULL,  -- 0.00 to 1.00
  matched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  strategy       TEXT NOT NULL,          -- deterministic_ref, amount_date, fuzzy_window, manual
  status         TEXT NOT NULL,          -- matched, auto_confirmed, manual_pending, rejected
  reviewer       TEXT
);

-- Reconciliation exceptions for mismatches and issues
CREATE TABLE IF NOT EXISTS reconciliation_exceptions (
  exc_id         BIGSERIAL PRIMARY KEY,
  kind           TEXT NOT NULL,          -- unmatched_credit, amount_mismatch, duplicate, stale
  ext_tx_id      TEXT REFERENCES bank_transactions(ext_tx_id),
  expect_id      BIGINT REFERENCES expected_settlements(expect_id),
  opened_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  state          TEXT NOT NULL DEFAULT 'open', -- open, in_review, resolved, suppressed
  resolution     TEXT,
  resolved_at    TIMESTAMPTZ
);

-- AML/OFAC screening records
CREATE TABLE IF NOT EXISTS aml_screenings (
  screening_id    BIGSERIAL PRIMARY KEY,
  subject_kind    TEXT NOT NULL,          -- borrower, payor, investor
  subject_id      TEXT NOT NULL,
  name            TEXT NOT NULL,
  dob             DATE,
  address         TEXT,
  result          TEXT NOT NULL,          -- clear, potential_match, hit
  score           NUMERIC(5,2) NOT NULL,
  screened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  details_json    JSONB
);

-- IRS 1098 mortgage interest records
CREATE TABLE IF NOT EXISTS irs_1098_records (
  record_id       BIGSERIAL PRIMARY KEY,
  tax_year        INT NOT NULL,
  borrower_id     TEXT NOT NULL,
  loan_id         TEXT NOT NULL,
  interest_paid_cents BIGINT NOT NULL,
  mortgage_ins_cents BIGINT DEFAULT 0,
  points_paid_cents BIGINT DEFAULT 0,
  prepared_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL DEFAULT 'prepared'  -- prepared, corrected, filed
);

-- Immutable audit chain with hash linking
CREATE TABLE IF NOT EXISTS audit_log (
  event_id     VARCHAR(26) PRIMARY KEY,     -- ULID
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor        TEXT NOT NULL,               -- service or user
  action       TEXT NOT NULL,               -- settle.post, reconcile.match, aml.hit
  object_kind  TEXT NOT NULL,
  object_id    TEXT NOT NULL,
  payload      JSONB NOT NULL,
  prev_hash    BYTEA,
  curr_hash    BYTEA NOT NULL
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_bank_tx_posted ON bank_transactions(posted_at);
CREATE INDEX IF NOT EXISTS idx_expect_state ON expected_settlements(state, initiated_at);
CREATE INDEX IF NOT EXISTS idx_match_status ON reconciliation_matches(status, score DESC);
CREATE INDEX IF NOT EXISTS idx_exc_state ON reconciliation_exceptions(state, opened_at);
CREATE INDEX IF NOT EXISTS idx_aml_result ON aml_screenings(result, screened_at);
CREATE INDEX IF NOT EXISTS idx_1098_year ON irs_1098_records(tax_year, borrower_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, occurred_at);

-- Settlement window configuration table
CREATE TABLE IF NOT EXISTS settlement_windows (
  rail           TEXT PRIMARY KEY,        -- ach, wire, check, card, rtp
  min_hours      INT NOT NULL,            -- minimum settlement time in hours
  max_hours      INT NOT NULL,            -- maximum settlement time in hours
  cutoff_time    TIME NOT NULL,           -- daily cutoff time in UTC
  business_days  BOOLEAN DEFAULT true,    -- whether to count only business days
  retry_config   JSONB                    -- retry policy configuration
);

-- Insert default settlement windows
INSERT INTO settlement_windows (rail, min_hours, max_hours, cutoff_time, business_days, retry_config)
VALUES 
  ('ach', 24, 48, '15:00:00', true, '{"max_retries": 3, "backoff": "geometric"}'),
  ('wire', 0, 1, '16:00:00', true, '{"max_retries": 1, "backoff": "none"}'),
  ('check', 48, 120, '14:00:00', true, '{"max_retries": 2, "backoff": "linear"}'),
  ('card', 24, 24, '23:59:59', false, '{"max_retries": 1, "backoff": "none"}'),
  ('rtp', 0, 0, '23:59:59', false, '{"max_retries": 0, "backoff": "none"}')
ON CONFLICT (rail) DO NOTHING;