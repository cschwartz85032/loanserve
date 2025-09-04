BEGIN;

ALTER TABLE loan_datapoints
  ADD COLUMN IF NOT EXISTS evidence_doc_id uuid NULL,
  ADD COLUMN IF NOT EXISTS evidence_page integer NULL CHECK (evidence_page IS NULL OR evidence_page >= 0),
  ADD COLUMN IF NOT EXISTS evidence_text_hash text NULL,
  ADD COLUMN IF NOT EXISTS confidence numeric(5,4) NULL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  ADD COLUMN IF NOT EXISTS extractor_version text NULL,
  ADD COLUMN IF NOT EXISTS prompt_version text NULL;

CREATE INDEX IF NOT EXISTS idx_ldp_loan_key        ON loan_datapoints (loan_id, key);
CREATE INDEX IF NOT EXISTS idx_ldp_confidence      ON loan_datapoints (confidence);
CREATE INDEX IF NOT EXISTS idx_ldp_evidence_docpage ON loan_datapoints (evidence_doc_id, evidence_page);

COMMIT;