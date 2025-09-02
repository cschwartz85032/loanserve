BEGIN;

-- Loan state (optional column on loan_candidates)
ALTER TABLE loan_candidates
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'intake',  -- intake|extract|qc|finalized|boarded
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS finalized_by uuid NULL;

-- QC Certificates (immutable artifacts)
CREATE TABLE IF NOT EXISTS qc_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id uuid NOT NULL REFERENCES loan_candidates(id) ON DELETE CASCADE,
  version text NOT NULL,
  file_uri text NOT NULL,
  file_sha256 text NOT NULL,
  docset_sha256 text NOT NULL,      -- hash over complete document set
  canonical_sha256 text NOT NULL,   -- hash over canonical datapoints
  rules_passed integer NOT NULL,
  rules_total integer NOT NULL,
  waivers jsonb NOT NULL DEFAULT '[]'::jsonb,
  issued_by text NOT NULL,          -- name/email string
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, loan_id, version)
);

-- Discrepancy reports (mutable by regeneration until finalization)
CREATE TABLE IF NOT EXISTS discrepancy_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id uuid NOT NULL REFERENCES loan_candidates(id) ON DELETE CASCADE,
  file_uri text NOT NULL,
  file_sha256 text NOT NULL,
  summary jsonb NOT NULL,                 -- structured summary incl. counts and AI rationale if any
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qc_cert_loan ON qc_certificates(tenant_id, loan_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_dr_loan ON discrepancy_reports(tenant_id, loan_id, generated_at DESC);

COMMIT;