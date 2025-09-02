-- Notification system tables
-- Supports templates, notifications, auditing, rate limiting, and preferences

BEGIN;

-- Drop existing notifications table if it exists (to recreate with proper schema)
DROP TABLE IF EXISTS notifications CASCADE;

-- Notification templates (versioned)
CREATE TABLE IF NOT EXISTS notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,                         -- e.g., BORR_HOI_REQUEST
  locale text NOT NULL DEFAULT 'en-US',
  channel text NOT NULL CHECK (channel IN ('email','sms','webhook')),
  subject text NULL,                          -- for email
  body text NOT NULL,                         -- Handlebars content for email/sms; JSON for webhook
  version text NOT NULL,                      -- e.g., v2025-09-03
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, locale, channel, version)
);

-- Notification requests & sends
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id uuid NULL,
  template_code text NOT NULL,
  locale text NOT NULL DEFAULT 'en-US',
  channel text NOT NULL CHECK (channel IN ('email','sms','webhook')),
  to_party text NOT NULL,                     -- 'borrower' | 'escrow' | 'lender' | 'ops' | exact endpoint
  to_address text NOT NULL,                   -- email address, phone, or URL
  params jsonb NOT NULL DEFAULT '{}'::jsonb,  -- render ctx
  status text NOT NULL CHECK (status IN ('queued','rendered','sent','failed','suppressed')) DEFAULT 'queued',
  reason text NULL,                            -- failure/suppression reason
  template_version text NOT NULL,
  idempotency_key text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL
);

-- Notification event log
CREATE TABLE IF NOT EXISTS notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  event text NOT NULL,                         -- requested|rendered|sent|failed|suppressed|retried
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ts timestamptz NOT NULL DEFAULT now()
);

-- Per-loan rate limiting (daily)
CREATE TABLE IF NOT EXISTS notification_counters (
  tenant_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  template_code text NOT NULL,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, loan_id, template_code, day)
);

-- Idempotency keys
CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Optional: per-party channel preferences (transactional on by default)
CREATE TABLE IF NOT EXISTS notification_prefs (
  tenant_id uuid NOT NULL,
  party_ref text NOT NULL,                     -- e.g., borrower:<id>
  channel text NOT NULL CHECK (channel IN ('email','sms','webhook')),
  allow boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, party_ref, channel)
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_status ON notifications(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_loan ON notifications(tenant_id, loan_id, created_at DESC);

COMMIT;