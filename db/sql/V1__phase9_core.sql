-- V1__phase9_core.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Immutable audit log (append-only with hash chain)
CREATE TABLE IF NOT EXISTS audit_log (
  id                BIGSERIAL PRIMARY KEY,
  correlation_id    UUID NOT NULL,
  account_id        UUID,
  actor_type        TEXT NOT NULL CHECK (actor_type IN ('user','system','integration')),
  actor_id          TEXT,
  event_type        TEXT NOT NULL,  -- 'CRUD.CREATE','FIN.POST','NOTICE.SENT', etc.
  event_ts_utc      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resource_type     TEXT NOT NULL,  -- 'loan','payment','notice','consent', ...
  resource_id       TEXT,
  payload_json      JSONB NOT NULL, -- PII minimized (see redaction policy)
  payload_hash      TEXT GENERATED ALWAYS AS (encode(digest(payload_json::text, 'sha256'),'hex')) STORED,
  prev_hash         TEXT,
  record_hash       TEXT,
  ip_addr           INET,
  user_agent        TEXT,
  geo               JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_log(correlation_id, event_ts_utc);
CREATE INDEX IF NOT EXISTS idx_audit_account    ON audit_log(account_id, event_ts_utc);
CREATE INDEX IF NOT EXISTS idx_audit_event      ON audit_log(event_type, event_ts_utc);
CREATE INDEX IF NOT EXISTS idx_audit_resource   ON audit_log(resource_type, resource_id);

CREATE OR REPLACE FUNCTION audit_log_set_hash_chain()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE prev TEXT;
BEGIN
  SELECT record_hash INTO prev
  FROM audit_log
  WHERE correlation_id = NEW.correlation_id
  ORDER BY event_ts_utc DESC, id DESC
  LIMIT 1;

  NEW.prev_hash := prev;

  NEW.record_hash := encode(
    digest(
      NEW.correlation_id::text || '|' ||
      NEW.event_ts_utc::text   || '|' ||
      NEW.payload_hash         || '|' ||
      COALESCE(NEW.prev_hash,''),
      'sha256'
    ),
  'hex');

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_audit_hash ON audit_log;
CREATE TRIGGER trg_audit_hash
BEFORE INSERT ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_log_set_hash_chain();

CREATE OR REPLACE FUNCTION forbid_audit_mutations()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$;

DROP TRIGGER IF EXISTS trg_audit_block_u ON audit_log;
DROP TRIGGER IF EXISTS trg_audit_block_d ON audit_log;
CREATE TRIGGER trg_audit_block_u BEFORE UPDATE ON audit_log
FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutations();
CREATE TRIGGER trg_audit_block_d BEFORE DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutations();

-- 2) Consent records
CREATE TABLE IF NOT EXISTS consent_record (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id        UUID NOT NULL,
  purpose           TEXT NOT NULL,       -- 'emarketing','esign','privacy', etc.
  scope             TEXT NOT NULL,       -- 'loan:read','email:marketing', ...
  status            TEXT NOT NULL CHECK (status IN ('granted','revoked')),
  channel           TEXT NOT NULL CHECK (channel IN ('web','email','sms','paper','ivr')),
  version           TEXT NOT NULL,       -- doc/policy version or hash
  evidence_uri      TEXT,                -- WORM link
  locale            TEXT DEFAULT 'en-US',
  ts_granted_utc    TIMESTAMPTZ,
  ts_revoked_utc    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consent_subject ON consent_record(subject_id, purpose);

-- 3) Communication preferences (granular)
CREATE TABLE IF NOT EXISTS communication_preference (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id        UUID NOT NULL,
  channel           TEXT NOT NULL CHECK (channel IN ('email','sms','phone','push','mail')),
  topic             TEXT NOT NULL,       -- 'billing','collections','marketing','privacy'
  allowed           BOOLEAN NOT NULL DEFAULT TRUE,
  frequency         TEXT CHECK (frequency IN ('immediate','daily','weekly','monthly')),
  last_updated_by   TEXT NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pref ON communication_preference(subject_id, channel, topic);

-- 4) Retention policies (config as data)
CREATE TABLE IF NOT EXISTS retention_policy (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_class         TEXT NOT NULL,   -- 'PII.ID','FIN.TXN','DOC.APPRAISAL', ...
  jurisdiction       TEXT NOT NULL,   -- 'US','EU','CA', ...
  min_retention_days INT NOT NULL,
  max_retention_days INT,
  legal_hold_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  policy_version     TEXT NOT NULL,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ret_pol ON retention_policy(data_class, jurisdiction, policy_version);

-- 4a) Legal hold (gap-closer)
CREATE TABLE IF NOT EXISTS legal_hold (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type        TEXT NOT NULL CHECK (scope_type IN ('artifact','account','subject')),
  scope_id          TEXT NOT NULL,
  reason            TEXT NOT NULL,
  imposed_by        TEXT NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_legal_hold_scope ON legal_hold(scope_type, scope_id) WHERE active;

-- 5) Process timers (parameterized notice windows)
CREATE TABLE IF NOT EXISTS process_timer (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timer_code        TEXT NOT NULL,   -- 'NOTICE.ADVERSE.ACTION','NOTICE.PRIVACY.ANNUAL', ...
  jurisdiction      TEXT NOT NULL,
  window_hours_min  INT NOT NULL,
  window_hours_max  INT NOT NULL,
  grace_hours       INT DEFAULT 0,
  version           TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_timer ON process_timer(timer_code, jurisdiction, version);

-- 6) Deletion receipts (immutable)
CREATE TABLE IF NOT EXISTS deletion_receipt (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id        UUID,
  data_class        TEXT NOT NULL,
  payload_summary   JSONB NOT NULL,
  deleted_at_utc    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evidence_uri      TEXT,
  responsible_actor TEXT NOT NULL,
  record_hash       TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7) Notice delivery log
CREATE TABLE IF NOT EXISTS notice_delivery_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID,
  subject_id        UUID,
  notice_code       TEXT NOT NULL,     -- 'PRIVACY.ANNUAL','ESCROW.ANALYSIS', ...
  delivery_channel  TEXT NOT NULL,     -- 'email','mail','portal'
  delivery_status   TEXT NOT NULL CHECK (delivery_status IN ('queued','sent','failed','opened','returned')),
  scheduled_for     TIMESTAMPTZ NOT NULL,
  sent_at           TIMESTAMPTZ,
  failure_reason    TEXT,
  correlation_id    UUID NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notice_account ON notice_delivery_log(account_id, notice_code, scheduled_for);

-- 8) Account ledger for balance replay
CREATE TABLE IF NOT EXISTS account_balance_ledger (
  id                BIGSERIAL PRIMARY KEY,
  account_id        UUID NOT NULL,
  posting_ts_utc    TIMESTAMPTZ NOT NULL,
  amount_cents      BIGINT NOT NULL,
  currency          CHAR(3) NOT NULL DEFAULT 'USD',
  txn_type          TEXT NOT NULL CHECK (txn_type IN ('debit','credit')),
  description       TEXT,
  external_ref      TEXT,
  correlation_id    UUID NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_acct_ledger ON account_balance_ledger(account_id, posting_ts_utc);

-- 9) Artifact registry (WORM links)
CREATE TABLE IF NOT EXISTS artifact (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID,
  subject_id        UUID,
  artifact_code     TEXT NOT NULL, -- 'DISCLOSURE.TILA','APPRAISAL','PRIVACY.NOTICE'
  uri               TEXT NOT NULL, -- object store URL / DMS ID
  sha256            TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10) DSAR requests (gap-closer)
CREATE TABLE IF NOT EXISTS data_subject_request (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id        UUID NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('access','deletion','correction')),
  status            TEXT NOT NULL CHECK (status IN ('received','in_progress','completed','rejected')),
  submitted_via     TEXT NOT NULL CHECK (submitted_via IN ('portal','email','mail')),
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at            TIMESTAMPTZ NOT NULL,
  closed_at         TIMESTAMPTZ,
  details_json      JSONB,
  case_ref          TEXT
);
CREATE INDEX IF NOT EXISTS idx_dsar_subject ON data_subject_request(subject_id, status);