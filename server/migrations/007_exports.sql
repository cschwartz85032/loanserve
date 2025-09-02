BEGIN;

CREATE TABLE IF NOT EXISTS exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  template text NOT NULL CHECK (template IN ('fannie','freddie','custom')),
  status text NOT NULL CHECK (status IN ('queued','running','succeeded','failed')) DEFAULT 'queued',
  file_uri text NULL,                      -- s3://...
  file_sha256 text NULL,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  lineage jsonb NOT NULL DEFAULT '{}'::jsonb, -- summary, e.g. {key: {docId,page,hash}}
  mapper_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  requested_by uuid NULL
);

CREATE TABLE IF NOT EXISTS export_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  template text NOT NULL CHECK (template IN ('fannie','freddie','custom')),
  url text NOT NULL,
  secret text NULL,                 -- HMAC signing (optional)
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exports_loan ON exports(tenant_id, loan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exports_status ON exports(tenant_id, status, created_at DESC);

COMMIT;