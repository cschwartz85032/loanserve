BEGIN;

-- loan_documents → loan_candidates
ALTER TABLE loan_documents
  DROP CONSTRAINT IF EXISTS loan_documents_loan_id_fkey,
  ADD CONSTRAINT loan_documents_loan_id_fkey
    FOREIGN KEY (loan_id)
    REFERENCES loan_candidates(id)
    ON DELETE CASCADE;

-- loan_datapoints → loan_candidates
ALTER TABLE loan_datapoints
  DROP CONSTRAINT IF EXISTS loan_datapoints_loan_id_fkey,
  ADD CONSTRAINT loan_datapoints_loan_id_fkey
    FOREIGN KEY (loan_id)
    REFERENCES loan_candidates(id)
    ON DELETE CASCADE;

-- loan_conflicts → loan_candidates
ALTER TABLE loan_conflicts
  DROP CONSTRAINT IF EXISTS loan_conflicts_loan_id_fkey,
  ADD CONSTRAINT loan_conflicts_loan_id_fkey
    FOREIGN KEY (loan_id)
    REFERENCES loan_candidates(id)
    ON DELETE CASCADE;

-- import_errors → imports
ALTER TABLE import_errors
  DROP CONSTRAINT IF EXISTS import_errors_import_id_fkey,
  ADD CONSTRAINT import_errors_import_id_fkey
    FOREIGN KEY (import_id)
    REFERENCES imports(id)
    ON DELETE CASCADE;

-- import_mappings → imports
ALTER TABLE import_mappings
  DROP CONSTRAINT IF EXISTS import_mappings_import_id_fkey,
  ADD CONSTRAINT import_mappings_import_id_fkey
    FOREIGN KEY (import_id)
    REFERENCES imports(id)
    ON DELETE CASCADE;

-- qc_defects → qc_rules and → loan_candidates
ALTER TABLE qc_defects
  DROP CONSTRAINT IF EXISTS qc_defects_rule_id_fkey,
  ADD CONSTRAINT qc_defects_rule_id_fkey
    FOREIGN KEY (rule_id)
    REFERENCES qc_rules(id)
    ON DELETE CASCADE;

ALTER TABLE qc_defects
  DROP CONSTRAINT IF EXISTS qc_defects_loan_id_fkey,
  ADD CONSTRAINT qc_defects_loan_id_fkey
    FOREIGN KEY (loan_id)
    REFERENCES loan_candidates(id)
    ON DELETE CASCADE;

COMMIT;