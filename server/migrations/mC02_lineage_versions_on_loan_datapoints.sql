-- Migration C02: Evidence + version fields on loan_datapoints
-- Addresses: Missing lineage tracking, cannot certify provenance
-- NON-NEGOTIABLE: Required for explainable AI and audit compliance

BEGIN;

-- Add lineage & version columns if missing
ALTER TABLE loan_datapoints
  ADD COLUMN IF NOT EXISTS evidence_doc_id uuid NULL,
  ADD COLUMN IF NOT EXISTS evidence_page integer NULL CHECK (evidence_page IS NULL OR evidence_page >= 0),
  ADD COLUMN IF NOT EXISTS evidence_text_hash text NULL,
  ADD COLUMN IF NOT EXISTS confidence numeric(5,4) NULL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  ADD COLUMN IF NOT EXISTS extractor_version text NULL,
  ADD COLUMN IF NOT EXISTS prompt_version text NULL;

-- Add additional lineage fields for complete audit trail
ALTER TABLE loan_datapoints
  ADD COLUMN IF NOT EXISTS authority_priority integer NULL CHECK (authority_priority IS NULL OR authority_priority >= 0),
  ADD COLUMN IF NOT EXISTS authority_decision text NULL,
  ADD COLUMN IF NOT EXISTS produced_at timestamp with time zone NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS evidence_bounding_box jsonb NULL;

-- Tighten key/value controls for data integrity
ALTER TABLE loan_datapoints
  ALTER COLUMN key SET NOT NULL,
  ALTER COLUMN value SET NOT NULL,
  ALTER COLUMN ingest_source SET NOT NULL,
  ALTER COLUMN autofilled_from SET NOT NULL;

-- Add validation constraints
ALTER TABLE loan_datapoints
  ADD CONSTRAINT chk_evidence_page_valid CHECK (evidence_page IS NULL OR evidence_page >= 0),
  ADD CONSTRAINT chk_confidence_range CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  ADD CONSTRAINT chk_authority_priority_valid CHECK (authority_priority IS NULL OR authority_priority >= 0),
  ADD CONSTRAINT chk_key_not_empty CHECK (length(trim(key)) > 0),
  ADD CONSTRAINT chk_value_not_empty CHECK (length(trim(value)) > 0);

-- Helpful read-path indexes for performance
CREATE INDEX IF NOT EXISTS idx_ldp_loan_key         ON loan_datapoints(loan_id, key);
CREATE INDEX IF NOT EXISTS idx_ldp_confidence       ON loan_datapoints(confidence) WHERE confidence IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ldp_evidence_docpage ON loan_datapoints(evidence_doc_id, evidence_page) WHERE evidence_doc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ldp_authority        ON loan_datapoints(authority_priority) WHERE authority_priority IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ldp_produced_at      ON loan_datapoints(produced_at);
CREATE INDEX IF NOT EXISTS idx_ldp_extractor_version ON loan_datapoints(extractor_version) WHERE extractor_version IS NOT NULL;

-- Composite index for lineage queries
CREATE INDEX IF NOT EXISTS idx_ldp_lineage_composite ON loan_datapoints(loan_id, key, evidence_doc_id, extractor_version) WHERE evidence_doc_id IS NOT NULL;

COMMIT;

-- Verification: Check new columns exist
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'loan_datapoints'
  AND column_name IN ('evidence_doc_id', 'evidence_page', 'evidence_text_hash', 'confidence', 'extractor_version', 'prompt_version', 'authority_priority', 'authority_decision', 'produced_at', 'evidence_bounding_box')
ORDER BY column_name;