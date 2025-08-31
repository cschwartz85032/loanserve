-- Phase 10: Encryption Key Management Tables
-- Stores encryption keys and metadata for envelope encryption

-- Key metadata and lifecycle tracking
CREATE TABLE IF NOT EXISTS phase10_key_metadata (
  key_id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL,
  version INT NOT NULL DEFAULT 1,
  algorithm TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  rotated_at TIMESTAMPTZ,
  purpose TEXT NOT NULL, -- 'pii_email', 'pii_phone', 'document', 'consent'
  key_status TEXT NOT NULL DEFAULT 'active', -- 'active', 'rotated', 'expired', 'revoked'
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Constraints
  UNIQUE(tenant_id, purpose, version)
);

-- Encrypted Data Encryption Keys (DEKs)
CREATE TABLE IF NOT EXISTS phase10_encrypted_keys (
  key_id TEXT PRIMARY KEY REFERENCES phase10_key_metadata(key_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  
  -- Encrypted DEK data
  encrypted_dek BYTEA NOT NULL,      -- DEK encrypted with KEK
  dek_tag BYTEA NOT NULL,            -- GCM auth tag for DEK
  kek_salt BYTEA NOT NULL,           -- Salt used for KEK derivation
  iv BYTEA NOT NULL,                 -- Initialization vector
  algorithm TEXT NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE phase10_key_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase10_encrypted_keys ENABLE ROW LEVEL SECURITY;

-- RLS policies for tenant isolation
CREATE POLICY phase10_key_metadata_rls ON phase10_key_metadata
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY phase10_encrypted_keys_rls ON phase10_encrypted_keys
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Indexes for performance
CREATE INDEX idx_phase10_key_metadata_tenant_purpose ON phase10_key_metadata(tenant_id, purpose);
CREATE INDEX idx_phase10_key_metadata_status ON phase10_key_metadata(key_status, expires_at);
CREATE INDEX idx_phase10_encrypted_keys_tenant ON phase10_encrypted_keys(tenant_id);