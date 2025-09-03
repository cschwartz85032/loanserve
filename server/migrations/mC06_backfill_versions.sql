-- Migration C06: Backfill extractor versions for lineage completeness
-- Addresses: Missing version tracking for existing datapoints
-- NON-NEGOTIABLE: Required for explainable AI audit trail

BEGIN;

-- Backfill extractor_version where missing (use current EXTRACTOR_VERSION)
-- This ensures all existing datapoints have version tracking for compliance
UPDATE loan_datapoints
   SET extractor_version = COALESCE(extractor_version, 'v2025.09.03-baseline')
 WHERE extractor_version IS NULL
   AND ingest_source IN ('ai_extraction', 'automated_ocr', 'document_parser');

-- Backfill confidence values for extracted datapoints that are missing confidence
-- Set a conservative confidence level for historical data
UPDATE loan_datapoints
   SET confidence = CASE 
     WHEN ingest_source = 'manual_entry' THEN 1.0
     WHEN ingest_source = 'ai_extraction' THEN 0.85
     WHEN ingest_source = 'automated_ocr' THEN 0.75
     WHEN ingest_source = 'document_parser' THEN 0.80
     ELSE 0.50
   END
 WHERE confidence IS NULL;

-- Backfill produced_at for existing datapoints
UPDATE loan_datapoints
   SET produced_at = COALESCE(produced_at, created_at, now())
 WHERE produced_at IS NULL;

-- Set authority_priority for existing datapoints based on source type
-- Higher priority = more authoritative source
UPDATE loan_datapoints
   SET authority_priority = CASE 
     WHEN ingest_source = 'manual_entry' THEN 100
     WHEN ingest_source = 'manual_override' THEN 95
     WHEN ingest_source = 'verified_extraction' THEN 90
     WHEN ingest_source = 'ai_extraction' AND confidence >= 0.9 THEN 85
     WHEN ingest_source = 'ai_extraction' AND confidence >= 0.8 THEN 80
     WHEN ingest_source = 'ai_extraction' THEN 75
     WHEN ingest_source = 'automated_ocr' THEN 70
     WHEN ingest_source = 'document_parser' THEN 65
     WHEN ingest_source = 'imported_data' THEN 60
     ELSE 50
   END
 WHERE authority_priority IS NULL;

-- Set authority_decision for high-confidence extractions
UPDATE loan_datapoints
   SET authority_decision = CASE
     WHEN confidence >= 0.95 THEN 'auto_accept_high_confidence'
     WHEN confidence >= 0.85 THEN 'auto_accept_medium_confidence' 
     WHEN confidence >= 0.75 THEN 'review_recommended'
     WHEN confidence < 0.75 THEN 'manual_review_required'
     ELSE 'pending_review'
   END
 WHERE authority_decision IS NULL AND confidence IS NOT NULL;

-- Add default metadata for evidence tracking
UPDATE loan_datapoints
   SET evidence_bounding_box = '{}'::jsonb
 WHERE evidence_bounding_box IS NULL
   AND evidence_doc_id IS NOT NULL;

-- Create summary of backfill operation
DO $$
DECLARE
  backfill_summary text;
  total_rows integer;
  updated_versions integer;
  updated_confidence integer;
  updated_authority integer;
BEGIN
  SELECT COUNT(*) INTO total_rows FROM loan_datapoints;
  
  SELECT COUNT(*) INTO updated_versions 
  FROM loan_datapoints 
  WHERE extractor_version = 'v2025.09.03-baseline';
  
  SELECT COUNT(*) INTO updated_confidence 
  FROM loan_datapoints 
  WHERE confidence IS NOT NULL;
  
  SELECT COUNT(*) INTO updated_authority 
  FROM loan_datapoints 
  WHERE authority_priority IS NOT NULL;
  
  backfill_summary := format(
    'Backfill Summary: Total datapoints: %s, Versions backfilled: %s, Confidence set: %s, Authority priority set: %s',
    total_rows, updated_versions, updated_confidence, updated_authority
  );
  
  RAISE NOTICE '%', backfill_summary;
END$$;

COMMIT;

-- Verification: Check backfill results
SELECT 
  ingest_source,
  COUNT(*) as total_datapoints,
  COUNT(extractor_version) as with_version,
  COUNT(confidence) as with_confidence,
  COUNT(authority_priority) as with_authority,
  AVG(confidence) as avg_confidence,
  AVG(authority_priority) as avg_priority
FROM loan_datapoints
GROUP BY ingest_source
ORDER BY ingest_source;

-- Check for any remaining NULL values that need attention
SELECT 
  'Missing extractor_version' as issue,
  COUNT(*) as count
FROM loan_datapoints 
WHERE extractor_version IS NULL
UNION ALL
SELECT 
  'Missing confidence' as issue,
  COUNT(*) as count
FROM loan_datapoints 
WHERE confidence IS NULL
UNION ALL
SELECT 
  'Missing authority_priority' as issue,
  COUNT(*) as count
FROM loan_datapoints 
WHERE authority_priority IS NULL;