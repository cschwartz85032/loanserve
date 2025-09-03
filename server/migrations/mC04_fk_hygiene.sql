-- Migration C04: FK hygiene & ON DELETE policies
-- Addresses: Orphaned rows increase drift & storage costs, weak referential integrity
-- NON-NEGOTIABLE: Required for operational reliability

BEGIN;

-- loan_documents → loan_candidates (CASCADE)
-- Remove existing constraint and add CASCADE policy
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'loan_documents_loan_id_fkey') THEN
    ALTER TABLE loan_documents DROP CONSTRAINT loan_documents_loan_id_fkey;
  END IF;
END$$;

ALTER TABLE loan_documents
  ADD CONSTRAINT loan_documents_loan_id_fkey
  FOREIGN KEY (loan_id) REFERENCES loan_candidates(id) ON DELETE CASCADE;

-- loan_datapoints → loan_candidates (CASCADE)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'loan_datapoints_loan_id_fkey') THEN
    ALTER TABLE loan_datapoints DROP CONSTRAINT loan_datapoints_loan_id_fkey;
  END IF;
END$$;

ALTER TABLE loan_datapoints
  ADD CONSTRAINT loan_datapoints_loan_id_fkey
  FOREIGN KEY (loan_id) REFERENCES loan_candidates(id) ON DELETE CASCADE;

-- loan_conflicts → loan_candidates (CASCADE)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'loan_conflicts_loan_id_fkey') THEN
    ALTER TABLE loan_conflicts DROP CONSTRAINT loan_conflicts_loan_id_fkey;
  END IF;
END$$;

ALTER TABLE loan_conflicts
  ADD CONSTRAINT loan_conflicts_loan_id_fkey
  FOREIGN KEY (loan_id) REFERENCES loan_candidates(id) ON DELETE CASCADE;

-- import_errors & import_mappings → imports (CASCADE)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'import_errors_import_id_fkey') THEN
    ALTER TABLE import_errors DROP CONSTRAINT import_errors_import_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'import_mappings_import_id_fkey') THEN
    ALTER TABLE import_mappings DROP CONSTRAINT import_mappings_import_id_fkey;
  END IF;
END$$;

ALTER TABLE import_errors
  ADD CONSTRAINT import_errors_import_id_fkey
  FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE CASCADE;

ALTER TABLE import_mappings
  ADD CONSTRAINT import_mappings_import_id_fkey
  FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE CASCADE;

-- qc_defects → loan_candidates/qc_rules (CASCADE)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'qc_defects_loan_id_fkey') THEN
    ALTER TABLE qc_defects DROP CONSTRAINT qc_defects_loan_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'qc_defects_rule_id_fkey') THEN
    ALTER TABLE qc_defects DROP CONSTRAINT qc_defects_rule_id_fkey;
  END IF;
END$$;

-- Only add FK constraints if the target tables exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'qc_defects') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'loan_candidates') THEN
      EXECUTE 'ALTER TABLE qc_defects ADD CONSTRAINT qc_defects_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES loan_candidates(id) ON DELETE CASCADE';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'qc_rules') THEN
      EXECUTE 'ALTER TABLE qc_defects ADD CONSTRAINT qc_defects_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES qc_rules(id) ON DELETE CASCADE';
    END IF;
  END IF;
END$$;

-- Add evidence document FK if evidence_doc_id column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loan_datapoints' AND column_name = 'evidence_doc_id') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'loan_datapoints_evidence_doc_fkey') THEN
      -- Create FK to loan_documents if the target table exists
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'loan_documents') THEN
        EXECUTE 'ALTER TABLE loan_datapoints ADD CONSTRAINT loan_datapoints_evidence_doc_fkey FOREIGN KEY (evidence_doc_id) REFERENCES loan_documents(id) ON DELETE SET NULL';
      END IF;
    END IF;
  END IF;
END$$;

-- Add performance indexes for FK lookups
CREATE INDEX IF NOT EXISTS idx_loan_documents_loan_id ON loan_documents(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_datapoints_loan_id ON loan_datapoints(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_conflicts_loan_id ON loan_conflicts(loan_id);
CREATE INDEX IF NOT EXISTS idx_import_errors_import_id ON import_errors(import_id);
CREATE INDEX IF NOT EXISTS idx_import_mappings_import_id ON import_mappings(import_id);

-- Add conditional indexes for QC tables if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'qc_defects') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_qc_defects_loan_id ON qc_defects(loan_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_qc_defects_rule_id ON qc_defects(rule_id)';
  END IF;
END$$;

COMMIT;

-- Verification: Check FK constraints are in place
SELECT 
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
LEFT JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('loan_documents', 'loan_datapoints', 'loan_conflicts', 'import_errors', 'import_mappings', 'qc_defects')
ORDER BY tc.table_name, tc.constraint_name;