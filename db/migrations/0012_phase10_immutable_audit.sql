-- Phase 10: Immutable Audit Log with Hash Chain
-- Provides tamper-evident audit trail with cryptographic verification

-- Immutable audit log with hash chaining
CREATE TABLE IF NOT EXISTS phase10_audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  correlation_id UUID NOT NULL,
  event_id UUID NOT NULL DEFAULT gen_random_uuid(),
  event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL,
  actor_id UUID,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'service', 'system')),
  resource_urn TEXT NOT NULL, -- e.g., urn:loan:123, urn:doc:456
  event_seq BIGINT NOT NULL,
  
  -- Hash chain fields for immutability
  payload_hash BYTEA NOT NULL,   -- SHA-256 of the event payload
  payload_locator TEXT,          -- Optional: pointer to external storage (s3://...)
  prev_hash BYTEA,               -- Hash of previous record in chain
  chain_hash BYTEA NOT NULL,     -- SHA-256(prev.chain_hash || current_record_hash)
  signature BYTEA,               -- Optional: cryptographic signature
  
  -- Context information
  ip INET,
  user_agent TEXT,
  session_id TEXT,
  
  -- Event payload (encrypted if sensitive)
  payload JSONB NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure sequence integrity per resource
  UNIQUE (resource_urn, event_seq),
  
  -- Ensure event uniqueness
  UNIQUE (tenant_id, event_id)
);

-- Audit event sequence tracking per resource
CREATE TABLE IF NOT EXISTS phase10_audit_sequence (
  resource_urn TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL,
  current_seq BIGINT NOT NULL DEFAULT 0,
  last_hash BYTEA,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hash chain verification function
CREATE OR REPLACE FUNCTION verify_audit_chain(
  p_resource_urn TEXT,
  p_tenant_id UUID DEFAULT NULL
) RETURNS TABLE (
  valid BOOLEAN,
  broken_at BIGINT,
  total_records BIGINT,
  message TEXT
) AS $$
DECLARE
  prev_chain_hash BYTEA := NULL;
  current_record RECORD;
  expected_hash BYTEA;
  record_count BIGINT := 0;
BEGIN
  FOR current_record IN 
    SELECT id, event_seq, payload_hash, prev_hash, chain_hash, payload
    FROM phase10_audit_log 
    WHERE resource_urn = p_resource_urn 
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY event_seq
  LOOP
    record_count := record_count + 1;
    
    -- Calculate expected chain hash
    IF prev_chain_hash IS NULL THEN
      -- First record: chain_hash should be payload_hash
      expected_hash := current_record.payload_hash;
    ELSE
      -- Subsequent records: SHA-256(prev_chain_hash || payload_hash)
      expected_hash := digest(prev_chain_hash || current_record.payload_hash, 'sha256');
    END IF;
    
    -- Check if chain is valid
    IF current_record.chain_hash != expected_hash THEN
      RETURN QUERY SELECT false, current_record.event_seq, record_count, 
        format('Hash chain broken at sequence %s', current_record.event_seq);
      RETURN;
    END IF;
    
    -- Check prev_hash consistency
    IF current_record.prev_hash != prev_chain_hash THEN
      RETURN QUERY SELECT false, current_record.event_seq, record_count,
        format('Previous hash mismatch at sequence %s', current_record.event_seq);
      RETURN;
    END IF;
    
    prev_chain_hash := current_record.chain_hash;
  END LOOP;
  
  RETURN QUERY SELECT true, 0::BIGINT, record_count, 'Hash chain is valid';
END;
$$ LANGUAGE plpgsql;

-- Function to add audit event with automatic hash chaining
CREATE OR REPLACE FUNCTION add_phase10_audit_event(
  p_tenant_id UUID,
  p_correlation_id UUID,
  p_event_type TEXT,
  p_actor_id UUID,
  p_actor_type TEXT,
  p_resource_urn TEXT,
  p_payload JSONB,
  p_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID := gen_random_uuid();
  v_next_seq BIGINT;
  v_prev_hash BYTEA;
  v_payload_hash BYTEA;
  v_chain_hash BYTEA;
BEGIN
  -- Calculate payload hash
  v_payload_hash := digest(p_payload::text, 'sha256');
  
  -- Get next sequence number and previous hash
  INSERT INTO phase10_audit_sequence (resource_urn, tenant_id, current_seq, last_hash)
  VALUES (p_resource_urn, p_tenant_id, 1, v_payload_hash)
  ON CONFLICT (resource_urn) DO UPDATE SET
    current_seq = phase10_audit_sequence.current_seq + 1,
    last_hash = v_payload_hash,
    updated_at = now()
  RETURNING current_seq, last_hash INTO v_next_seq, v_prev_hash;
  
  -- For first record, prev_hash is NULL and chain_hash equals payload_hash
  -- For subsequent records, chain_hash = SHA-256(prev_chain_hash || payload_hash)
  IF v_next_seq = 1 THEN
    v_chain_hash := v_payload_hash;
    v_prev_hash := NULL;
  ELSE
    -- Get the actual previous chain hash
    SELECT chain_hash INTO v_prev_hash
    FROM phase10_audit_log 
    WHERE resource_urn = p_resource_urn AND event_seq = v_next_seq - 1;
    
    v_chain_hash := digest(v_prev_hash || v_payload_hash, 'sha256');
  END IF;
  
  -- Insert audit record
  INSERT INTO phase10_audit_log (
    tenant_id, correlation_id, event_id, event_type, actor_id, actor_type,
    resource_urn, event_seq, payload_hash, prev_hash, chain_hash,
    payload, ip, user_agent, session_id
  ) VALUES (
    p_tenant_id, p_correlation_id, v_event_id, p_event_type, p_actor_id, p_actor_type,
    p_resource_urn, v_next_seq, v_payload_hash, v_prev_hash, v_chain_hash,
    p_payload, p_ip, p_user_agent, p_session_id
  );
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE phase10_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase10_audit_sequence ENABLE ROW LEVEL SECURITY;

-- RLS policies for tenant isolation
CREATE POLICY phase10_audit_log_rls ON phase10_audit_log
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY phase10_audit_sequence_rls ON phase10_audit_sequence
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Indexes for performance
CREATE INDEX idx_phase10_audit_tenant_time ON phase10_audit_log(tenant_id, event_time DESC);
CREATE INDEX idx_phase10_audit_resource_seq ON phase10_audit_log(resource_urn, event_seq);
CREATE INDEX idx_phase10_audit_actor ON phase10_audit_log(actor_id, event_time DESC);
CREATE INDEX idx_phase10_audit_type ON phase10_audit_log(event_type, event_time DESC);
CREATE INDEX idx_phase10_audit_correlation ON phase10_audit_log(correlation_id);