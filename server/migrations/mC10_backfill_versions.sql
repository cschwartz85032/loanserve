-- Migration mC10: Backfill extractor versions for existing loan_datapoints
-- Addresses: Missing mC06 backfill migration script

BEGIN;

-- Backfill extractor_version for existing records that don't have it
-- Use a default version that indicates legacy data
UPDATE loan_datapoints 
SET 
  extractor_version = COALESCE(extractor_version, 'v1.0.0-legacy'),
  prompt_version = COALESCE(prompt_version, 'v1.0.0-legacy'),
  authority_priority = COALESCE(authority_priority, 50), -- Medium priority default
  confidence = COALESCE(confidence, 0.5), -- Low confidence for manual entries
  produced_at = COALESCE(produced_at, created_at, NOW())
WHERE 
  extractor_version IS NULL 
  OR prompt_version IS NULL 
  OR authority_priority IS NULL 
  OR confidence IS NULL
  OR produced_at IS NULL;

-- Set default values for records that came from manual entry
-- These should have lower authority priority since they weren't AI-extracted
UPDATE loan_datapoints 
SET 
  extractor_version = 'manual-entry',
  authority_priority = 30 -- Lower priority for manual entries
WHERE 
  ingest_source = 'manual_entry' 
  AND extractor_version = 'v1.0.0-legacy';

-- For AI-extracted records, set appropriate confidence and priority
UPDATE loan_datapoints
SET
  confidence = CASE 
    WHEN confidence < 0.1 THEN 0.7 -- Boost unrealistically low confidence
    WHEN confidence > 1.0 THEN 1.0 -- Cap at maximum
    ELSE confidence
  END,
  authority_priority = CASE
    WHEN ingest_source = 'ai_extraction' AND authority_priority = 50 THEN 85 -- High priority for AI
    WHEN ingest_source = 'document' AND authority_priority = 50 THEN 80 -- High priority for doc-based
    ELSE authority_priority
  END
WHERE 
  (ingest_source IN ('ai_extraction', 'document') AND authority_priority = 50)
  OR (confidence < 0.1 OR confidence > 1.0);

-- Add NOT NULL constraints after backfilling
-- Now that all records have values, we can enforce them

-- Only add NOT NULL if all records now have values
DO $$
BEGIN
  -- Check if all records have extractor_version
  IF NOT EXISTS (SELECT 1 FROM loan_datapoints WHERE extractor_version IS NULL LIMIT 1) THEN
    ALTER TABLE loan_datapoints ALTER COLUMN extractor_version SET NOT NULL;
  END IF;
  
  -- Check if all records have produced_at  
  IF NOT EXISTS (SELECT 1 FROM loan_datapoints WHERE produced_at IS NULL LIMIT 1) THEN
    ALTER TABLE loan_datapoints ALTER COLUMN produced_at SET NOT NULL;
  END IF;
  
  -- Note: confidence and authority_priority should already have constraints from earlier migrations
END $$;

COMMIT;