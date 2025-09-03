-- Migration mC09: Fix CASCADE constraints on evidence_doc_id fields
-- Addresses: "38 CASCADE constraints in place" accuracy issue

BEGIN;

-- Check and fix loan_datapoints.evidence_doc_id FK constraint
-- Current constraint might not have CASCADE - fix it

-- Drop existing FK constraint if it exists without CASCADE
DO $$
BEGIN
  -- Check if FK exists without CASCADE
  IF EXISTS (
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu 
      ON rc.constraint_name = kcu.constraint_name
    WHERE kcu.table_name = 'loan_datapoints' 
      AND kcu.column_name = 'evidence_doc_id'
      AND rc.delete_rule != 'CASCADE'
  ) THEN
    -- Find the constraint name and drop it
    EXECUTE (
      SELECT 'ALTER TABLE loan_datapoints DROP CONSTRAINT ' || constraint_name
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu 
        ON rc.constraint_name = kcu.constraint_name
      WHERE kcu.table_name = 'loan_datapoints' 
        AND kcu.column_name = 'evidence_doc_id'
      LIMIT 1
    );
  END IF;
END $$;

-- Add CASCADE constraint for loan_datapoints.evidence_doc_id
ALTER TABLE loan_datapoints 
ADD CONSTRAINT loan_datapoints_evidence_doc_id_fk 
FOREIGN KEY (evidence_doc_id) 
REFERENCES loan_documents(id) 
ON DELETE CASCADE;

-- Check and fix qc_defects.evidence_doc_id FK constraint if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'qc_defects') THEN
    -- Drop existing FK constraint if it exists without CASCADE
    IF EXISTS (
      SELECT 1 FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu 
        ON rc.constraint_name = kcu.constraint_name
      WHERE kcu.table_name = 'qc_defects' 
        AND kcu.column_name = 'evidence_doc_id'
        AND rc.delete_rule != 'CASCADE'
    ) THEN
      -- Drop the constraint
      EXECUTE (
        SELECT 'ALTER TABLE qc_defects DROP CONSTRAINT ' || constraint_name
        FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu 
          ON rc.constraint_name = kcu.constraint_name
        WHERE kcu.table_name = 'qc_defects' 
          AND kcu.column_name = 'evidence_doc_id'
        LIMIT 1
      );
    END IF;
    
    -- Add CASCADE constraint for qc_defects.evidence_doc_id
    EXECUTE $$ALTER TABLE qc_defects 
      ADD CONSTRAINT qc_defects_evidence_doc_id_fk 
      FOREIGN KEY (evidence_doc_id) 
      REFERENCES loan_documents(id) 
      ON DELETE CASCADE$$;
  END IF;
END $$;

-- Verify all evidence_doc_id fields have CASCADE constraints
-- This ensures document deletion properly cascades to dependent records

COMMIT;