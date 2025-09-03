-- Step 22: AI Pipeline Monitoring (Simplified)
-- Core monitoring tables without modifying existing system_alerts

BEGIN;

-- AI Model Performance Monitoring
CREATE TABLE IF NOT EXISTS ai_model_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  model_name text NOT NULL,
  model_version text NOT NULL,
  operation_type text NOT NULL,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer NOT NULL,
  confidence_score decimal(5,4),
  cost_cents integer,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- AI Model Drift Detection
CREATE TABLE IF NOT EXISTS ai_drift_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  model_name text NOT NULL,
  drift_type text NOT NULL,
  drift_score decimal(5,4) NOT NULL,
  threshold_exceeded boolean NOT NULL DEFAULT false,
  sample_size integer NOT NULL,
  baseline_period_start timestamptz NOT NULL,
  baseline_period_end timestamptz NOT NULL,
  measurement_timestamp timestamptz NOT NULL DEFAULT now()
);

-- Pipeline Performance Metrics
CREATE TABLE IF NOT EXISTS pipeline_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  pipeline_stage text NOT NULL,
  operation_id uuid NOT NULL,
  document_type text,
  processing_time_ms integer NOT NULL,
  queue_wait_ms integer NOT NULL,
  success boolean NOT NULL,
  error_type text,
  resource_usage jsonb,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Cache Performance Tracking
CREATE TABLE IF NOT EXISTS cache_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  cache_type text NOT NULL,
  operation text NOT NULL,
  key_hash text NOT NULL,
  hit_rate decimal(5,4),
  latency_ms integer,
  size_bytes integer,
  ttl_seconds integer,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Resource Utilization Tracking
CREATE TABLE IF NOT EXISTS resource_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  resource_type text NOT NULL,
  measurement_value decimal(10,4) NOT NULL,
  measurement_unit text NOT NULL,
  threshold_warning decimal(10,4),
  threshold_critical decimal(10,4),
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient monitoring queries
CREATE INDEX IF NOT EXISTS idx_ai_model_metrics_tenant_time 
ON ai_model_metrics (tenant_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_ai_model_metrics_model_operation 
ON ai_model_metrics (model_name, operation_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_ai_drift_metrics_tenant_model 
ON ai_drift_metrics (tenant_id, model_name, measurement_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_performance_tenant_stage 
ON pipeline_performance (tenant_id, pipeline_stage, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_cache_metrics_tenant_type 
ON cache_metrics (tenant_id, cache_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_resource_metrics_tenant_type 
ON resource_metrics (tenant_id, resource_type, timestamp DESC);

COMMIT;