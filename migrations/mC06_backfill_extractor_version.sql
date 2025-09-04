BEGIN;

UPDATE loan_datapoints
  SET extractor_version = COALESCE(extractor_version, 'v2025.09.03')
 WHERE extractor_version IS NULL;

COMMIT;