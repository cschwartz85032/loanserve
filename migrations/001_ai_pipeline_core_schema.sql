-- AI Servicing Pipeline Core Schema
-- Implements investor-first, escrow-led processing with complete lineage tracking
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Loan candidates (shells for AI processing)
CREATE TABLE IF NOT EXISTS loan_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'processing', 'conflicts', 'validated', 'completed', 'failed')),
  investor_id uuid NULL,
  escrow_id uuid NULL,
  property_id uuid NULL,
  source_import_id uuid NULL,
  loan_urn text NULL, -- Reference to main loans table
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Documents with lineage tracking and OCR status
CREATE TABLE IF NOT EXISTS loan_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES loan_candidates(id) ON DELETE CASCADE,
  storage_uri text NOT NULL,
  sha256 text NOT NULL,
  doc_type text NULL CHECK (doc_type IN ('loan_application', 'credit_report', 'income_verification', 'appraisal', 'title_insurance', 'closing_disclosure', 'promissory_note', 'deed_of_trust', 'mismo', 'csv', 'json', 'unknown')),
  page_range int4range NULL,
  class_confidence numeric(5,4) NULL CHECK (class_confidence >= 0 AND class_confidence <= 1),
  ocr_status text NULL CHECK (ocr_status IN ('pending', 'processing', 'completed', 'failed')),
  version integer NOT NULL DEFAULT 1,
  lineage_parent_id uuid NULL REFERENCES loan_documents(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Canonical datapoints with explainable lineage
CREATE TABLE IF NOT EXISTS loan_datapoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES loan_candidates(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NULL,
  normalized_value text NULL,
  confidence numeric(5,4) NULL CHECK (confidence >= 0 AND confidence <= 1),
  autofilled_from text NOT NULL DEFAULT 'payload' CHECK (autofilled_from IN ('payload','document','vendor','user','investor_directive','escrow_instruction')),
  ingest_source text NOT NULL DEFAULT 'payload' CHECK (ingest_source IN ('payload','document','vendor','user','ai_extraction','ocr','manual_entry','vendor_api','document_parse','investor_directive','escrow_instruction')),
  evidence_doc_id uuid NULL REFERENCES loan_documents(id) ON DELETE SET NULL,
  evidence_page integer NULL,
  evidence_text_hash text NULL, -- SHA-256 hash for tamper detection
  evidence_bounding_box jsonb NULL, -- {x, y, width, height} for OCR
  extractor_version text NULL,
  prompt_version text NULL,
  authority_priority integer NOT NULL DEFAULT 500, -- Authority Matrix priority
  authority_decision jsonb NULL, -- Winner, reason, conflicting sources
  produced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, key)
);

-- Authority conflicts and resolution tracking
CREATE TABLE IF NOT EXISTS loan_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES loan_candidates(id) ON DELETE CASCADE,
  key text NOT NULL,
  candidates jsonb NOT NULL, -- [{value, source, docType, confidence, priority, evidence...}]
  selected_value text NULL,
  resolver_id uuid NULL,
  rationale text NULL,
  authority_rule text NULL, -- Which authority rule was applied
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','waived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL
);

-- Document imports with processing status
CREATE TABLE IF NOT EXISTS imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('mismo','csv','json','pdf','zip')),
  filename text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 text NOT NULL,
  docset_id uuid NULL,
  status text NOT NULL CHECK (status IN ('received','validating','errors','accepted','ingested','failed')),
  error_count integer NOT NULL DEFAULT 0,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb, -- {"split":%,"ocr":%,"extract":%}
  mapping_version text NULL,
  correlation_id text NULL, -- For tracing processing flow
  investor_directives jsonb NULL DEFAULT '[]'::jsonb,
  escrow_instructions jsonb NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Import processing errors
CREATE TABLE IF NOT EXISTS import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('fatal','warn','info')),
  pointer text NOT NULL,
  message text NOT NULL,
  raw_fragment jsonb NULL,
  suggested_correction jsonb NULL,
  can_auto_correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Field mappings with lineage
CREATE TABLE IF NOT EXISTS import_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  canonical_key text NOT NULL,
  normalized_value text NULL,
  source_pointer text NULL, -- XPath/CSV col/JSON path or "pdf:docId:page"
  evidence_hash text NULL, -- SHA-256 hash of source text
  confidence numeric(5,4) NULL CHECK (confidence >= 0 AND confidence <= 1),
  autofilled_from text NOT NULL DEFAULT 'payload' CHECK (autofilled_from IN ('payload','document','vendor','user','ai_extraction','ocr')),
  transformation_log jsonb NULL DEFAULT '[]'::jsonb, -- Track all transformations
  created_at timestamptz NOT NULL DEFAULT now()
);

-- QC Rules for validation
CREATE TABLE IF NOT EXISTS qc_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('Low','Medium','High','Critical')),
  engine_type text NOT NULL CHECK (engine_type IN ('deterministic','ai_assisted','business_rule','cross_field')),
  field_name text NULL, -- Target field for validation
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  program_specific text[] NULL, -- ['FNMA', 'FHLMC'] for program-specific rules
  enabled boolean NOT NULL DEFAULT true,
  auto_correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- QC Defects and violations
CREATE TABLE IF NOT EXISTS qc_defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES loan_candidates(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES qc_rules(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','waived')),
  message text NOT NULL,
  evidence_doc_id uuid NULL REFERENCES loan_documents(id),
  original_value text NULL,
  suggested_value text NULL,
  can_auto_correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  waiver_id uuid NULL
);

-- Lineage tracking for complete audit trail
CREATE TABLE IF NOT EXISTS lineage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lineage_id text UNIQUE NOT NULL, -- Generated lineage identifier
  field_name text NOT NULL,
  value text NOT NULL,
  source text NOT NULL CHECK (source IN ('ai_extraction', 'ocr', 'manual_entry', 'vendor_api', 'document_parse', 'investor_directive', 'escrow_instruction')),
  confidence numeric(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  document_id uuid NULL REFERENCES loan_documents(id),
  page_number integer NULL,
  text_hash text NOT NULL, -- SHA-256 of source text
  bounding_box jsonb NULL,
  extractor_version text NULL,
  prompt_version text NULL,
  operator_id uuid NULL,
  vendor_name text NULL,
  derived_from text[] NULL, -- Array of parent lineage IDs
  transformations jsonb NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Worker processing status and health
CREATE TABLE IF NOT EXISTS worker_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name text NOT NULL,
  worker_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'stopped')),
  last_heartbeat timestamptz NOT NULL DEFAULT now(),
  work_items_processed integer NOT NULL DEFAULT 0,
  work_items_failed integer NOT NULL DEFAULT 0,
  cache_size integer NOT NULL DEFAULT 0,
  metadata jsonb NULL DEFAULT '{}'::jsonb
);

-- Pipeline alerts and monitoring
CREATE TABLE IF NOT EXISTS pipeline_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id text UNIQUE NOT NULL,
  type text NOT NULL CHECK (type IN ('error', 'warning', 'info')),
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  resolved_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL
);

-- Enhanced audit log for AI pipeline
CREATE TABLE IF NOT EXISTS audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NULL,
  correlation_id text NULL, -- For tracing related operations
  metadata jsonb NULL,
  ts timestamptz NOT NULL DEFAULT now()
);

-- Event outbox for reliable publishing
CREATE TABLE IF NOT EXISTS event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id uuid NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  retries int NOT NULL DEFAULT 0,
  correlation_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Monitoring metrics for observability
CREATE TABLE IF NOT EXISTS monitoring_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric text NOT NULL,
  dim jsonb NOT NULL DEFAULT '{}'::jsonb,
  value numeric NOT NULL,
  tenant_id uuid NULL,
  correlation_id text NULL,
  ts timestamptz NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_imports_tenant_status_created ON imports (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_errors_import ON import_errors(import_id);
CREATE INDEX IF NOT EXISTS idx_import_mappings_import ON import_mappings(import_id);
CREATE INDEX IF NOT EXISTS idx_ldp_key_extractor ON loan_datapoints (key, extractor_version);
CREATE INDEX IF NOT EXISTS idx_ldp_prompt_version ON loan_datapoints (prompt_version) WHERE prompt_version IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ldp_confidence ON loan_datapoints (confidence DESC);
CREATE INDEX IF NOT EXISTS idx_ldp_authority_priority ON loan_datapoints (authority_priority DESC);
CREATE INDEX IF NOT EXISTS idx_lineage_field_name ON lineage_records (field_name);
CREATE INDEX IF NOT EXISTS idx_lineage_source ON lineage_records (source);
CREATE INDEX IF NOT EXISTS idx_lineage_document ON lineage_records (document_id) WHERE document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loan_conflicts_status ON loan_conflicts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qc_defects_status ON qc_defects (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_worker_status_type ON worker_status (worker_type, status);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_metric_ts ON monitoring_events (metric, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audits_correlation_id ON audits (correlation_id) WHERE correlation_id IS NOT NULL;

-- Text search indexes for efficient searching
CREATE INDEX IF NOT EXISTS idx_loan_datapoints_key_trgm ON loan_datapoints USING gin (key gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_lineage_records_field_trgm ON lineage_records USING gin (field_name gin_trgm_ops);

COMMIT;