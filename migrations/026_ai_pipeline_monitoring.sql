-- Step 22: Advanced AI Pipeline Optimization & Performance Monitoring
-- Comprehensive monitoring, optimization, and performance tracking for AI servicing pipeline

BEGIN;

-- AI Model Performance Monitoring
CREATE TABLE IF NOT EXISTS ai_model_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  model_name text NOT NULL,
  model_version text NOT NULL,
  operation_type text NOT NULL, -- 'extraction', 'classification', 'validation', 'analysis'
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
  tenant_id uuid NOT NULL,
  model_name text NOT NULL,
  drift_type text NOT NULL, -- 'data', 'concept', 'prediction'
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
  tenant_id uuid NOT NULL,
  pipeline_stage text NOT NULL, -- 'intake', 'extraction', 'validation', 'routing', 'completion'
  operation_id uuid NOT NULL,
  document_type text,
  processing_time_ms integer NOT NULL,
  queue_wait_ms integer NOT NULL,
  success boolean NOT NULL,
  error_type text,
  resource_usage jsonb, -- CPU, memory, etc.
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Cache Performance Tracking
CREATE TABLE IF NOT EXISTS cache_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  cache_type text NOT NULL, -- 'ai_response', 'vendor_data', 'document_analysis'
  operation text NOT NULL, -- 'hit', 'miss', 'eviction', 'write'
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
  tenant_id uuid NOT NULL,
  resource_type text NOT NULL, -- 'cpu', 'memory', 'queue_depth', 'connections'
  measurement_value decimal(10,4) NOT NULL,
  measurement_unit text NOT NULL, -- 'percent', 'bytes', 'count'
  threshold_warning decimal(10,4),
  threshold_critical decimal(10,4),
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- System Health Alerts (conditionally create or alter existing table)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'system_alerts') THEN
    CREATE TABLE system_alerts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      alert_type text NOT NULL,
      severity text NOT NULL,
      title text NOT NULL,
      description text NOT NULL,
      metric_value decimal(10,4),
      threshold_value decimal(10,4),
      acknowledged boolean NOT NULL DEFAULT false,
      resolved boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      acknowledged_at timestamptz,
      resolved_at timestamptz
    );
  ELSE
    -- Add missing columns if they don't exist
    ALTER TABLE system_alerts 
    ADD COLUMN IF NOT EXISTS resolved boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
  END IF;
END $$;

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

CREATE INDEX IF NOT EXISTS idx_system_alerts_tenant_severity 
ON system_alerts (tenant_id, severity, created_at DESC);

COMMIT;