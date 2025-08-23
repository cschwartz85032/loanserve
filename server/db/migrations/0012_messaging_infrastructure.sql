-- Messaging Infrastructure Tables
-- Implements idempotency and event sourcing patterns

-- Consumer inbox for idempotency
CREATE TABLE IF NOT EXISTS consumer_inbox (
  consumer VARCHAR(100) NOT NULL,
  message_id VARCHAR(26) NOT NULL,  -- ULID
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  result_hash VARCHAR(64),
  result_data JSONB,
  PRIMARY KEY (consumer, message_id)
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_consumer_inbox_processed_at 
  ON consumer_inbox(processed_at);

-- Outbox for transactional publishing
CREATE TABLE IF NOT EXISTS outbox_events (
  event_id VARCHAR(26) PRIMARY KEY,  -- ULID
  exchange VARCHAR(100) NOT NULL,
  routing_key VARCHAR(200) NOT NULL,
  payload JSONB NOT NULL,
  headers JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP WITH TIME ZONE,
  publish_attempts INTEGER DEFAULT 0,
  last_error TEXT,
  metadata JSONB
);

-- Indexes for outbox processing
CREATE INDEX IF NOT EXISTS idx_outbox_events_unpublished 
  ON outbox_events(published_at) 
  WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_events_created 
  ON outbox_events(created_at);

-- Saga state management
CREATE TABLE IF NOT EXISTS saga_states (
  saga_id UUID PRIMARY KEY,
  saga_type VARCHAR(100) NOT NULL,
  current_step VARCHAR(100) NOT NULL,
  state JSONB NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  metadata JSONB
);

-- Index for active sagas
CREATE INDEX IF NOT EXISTS idx_saga_states_active 
  ON saga_states(saga_type, current_step) 
  WHERE completed_at IS NULL AND failed_at IS NULL;

-- Saga step history
CREATE TABLE IF NOT EXISTS saga_step_history (
  id SERIAL PRIMARY KEY,
  saga_id UUID NOT NULL REFERENCES saga_states(saga_id) ON DELETE CASCADE,
  step_name VARCHAR(100) NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  idempotency_key VARCHAR(200),
  UNIQUE(saga_id, step_name, idempotency_key)
);

-- Index for saga history queries
CREATE INDEX IF NOT EXISTS idx_saga_step_history_saga 
  ON saga_step_history(saga_id, started_at);

-- Message dead letter storage
CREATE TABLE IF NOT EXISTS dead_letter_messages (
  id SERIAL PRIMARY KEY,
  queue_name VARCHAR(200) NOT NULL,
  message_id VARCHAR(26),
  correlation_id UUID,
  envelope JSONB NOT NULL,
  error_message TEXT,
  error_count INTEGER DEFAULT 1,
  first_failed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_failed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT
);

-- Index for unresolved dead letters
CREATE INDEX IF NOT EXISTS idx_dead_letter_messages_unresolved 
  ON dead_letter_messages(queue_name, resolved_at) 
  WHERE resolved_at IS NULL;

-- Message processing metrics
CREATE TABLE IF NOT EXISTS message_metrics (
  id SERIAL PRIMARY KEY,
  schema_name VARCHAR(200) NOT NULL,
  consumer VARCHAR(100) NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processing_time_ms INTEGER,
  success BOOLEAN NOT NULL,
  retry_count INTEGER DEFAULT 0,
  metadata JSONB
);

-- Index for metrics aggregation
CREATE INDEX IF NOT EXISTS idx_message_metrics_aggregate 
  ON message_metrics(schema_name, consumer, processed_at);

-- Cleanup function for old inbox entries (30 days retention)
CREATE OR REPLACE FUNCTION cleanup_old_inbox_entries() 
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM consumer_inbox 
  WHERE processed_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Cleanup function for published outbox events (7 days retention)
CREATE OR REPLACE FUNCTION cleanup_published_outbox_events() 
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM outbox_events 
  WHERE published_at IS NOT NULL 
    AND published_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to check idempotency
CREATE OR REPLACE FUNCTION check_message_processed(
  p_consumer VARCHAR(100),
  p_message_id VARCHAR(26)
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM consumer_inbox 
    WHERE consumer = p_consumer 
      AND message_id = p_message_id
  );
END;
$$ LANGUAGE plpgsql;

-- Function to record processed message
CREATE OR REPLACE FUNCTION record_message_processed(
  p_consumer VARCHAR(100),
  p_message_id VARCHAR(26),
  p_result_hash VARCHAR(64) DEFAULT NULL,
  p_result_data JSONB DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO consumer_inbox (consumer, message_id, result_hash, result_data)
  VALUES (p_consumer, p_message_id, p_result_hash, p_result_data)
  ON CONFLICT (consumer, message_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;