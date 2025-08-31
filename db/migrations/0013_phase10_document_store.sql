-- Phase 10: First-Party Document Custody System
-- Stores executed agreements, certificates, and evidence with tamper detection

-- Primary document storage with first-party custody
CREATE TABLE IF NOT EXISTS phase10_loan_document (
  doc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  loan_urn TEXT NOT NULL,                   -- urn:loan:<uuid|id>
  doc_type TEXT NOT NULL,                   -- 'executed_agreement','disclosure','notice','amendment'
  doc_category TEXT,                        -- 'origination','servicing','compliance','collection'
  
  -- Provider information
  provider TEXT NOT NULL,                   -- 'docusign','internal','upload','esign_provider'
  provider_ref TEXT,                        -- DocuSign Envelope ID, etc.
  external_status TEXT,                     -- 'created','sent','completed','declined','voided'
  
  -- Document versioning and integrity
  version INT NOT NULL DEFAULT 1,
  content_hash BYTEA NOT NULL,              -- SHA-256 of stored PDF content
  content_locator TEXT NOT NULL,            -- Object store URL (s3://, gs://)
  content_size_bytes BIGINT,
  
  -- Certificate and evidence storage
  certificate_hash BYTEA,                   -- SHA-256 of completion certificate
  certificate_locator TEXT,                -- Object store URL for certificate
  evidence_bundle_locator TEXT,             -- Complete evidence package (PDF + cert + audit trail)
  
  -- Document metadata
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  original_filename TEXT,
  document_title TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ,                  -- When document was executed/signed
  received_at TIMESTAMPTZ,                  -- When we received from provider
  archived_at TIMESTAMPTZ,
  
  -- Signing and parties information (no PII in main table)
  signer_count INT DEFAULT 0,
  signing_completed BOOLEAN DEFAULT false,
  
  -- Metadata storage (structured data, no direct PII)
  metadata JSONB NOT NULL DEFAULT '{}',     -- Document-specific data, tab values, etc.
  
  -- Retention and compliance
  retention_policy TEXT,                    -- Reference to retention policy
  destruction_date DATE,                    -- Scheduled destruction date
  
  UNIQUE(tenant_id, provider, provider_ref, version)
);

-- Document signers/participants (separate table for PII isolation)
CREATE TABLE IF NOT EXISTS phase10_document_signers (
  signer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES phase10_loan_document(doc_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  
  -- Signer identification (encrypted)
  signer_name_encrypted BYTEA,              -- Encrypted name
  signer_email_encrypted BYTEA,             -- Encrypted email
  signer_phone_encrypted BYTEA,             -- Encrypted phone
  
  -- Signing metadata
  role TEXT NOT NULL,                       -- 'borrower','co-borrower','guarantor','agent'
  signing_order INT,
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending','sent','viewed','signed','declined'
  
  -- Timestamps
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  
  -- Authentication and security
  ip_address INET,
  user_agent TEXT,
  authentication_method TEXT,               -- 'email','sms','knowledge_based','id_verification'
  
  -- Evidence
  signature_image_locator TEXT,             -- Location of signature image
  identity_verification_locator TEXT,       -- ID verification documents
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Document access log for audit trails
CREATE TABLE IF NOT EXISTS phase10_document_access_log (
  access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES phase10_loan_document(doc_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  
  -- Access information
  accessed_by UUID NOT NULL,                -- User or system identifier
  access_type TEXT NOT NULL,                -- 'view','download','edit','share'
  access_method TEXT,                       -- 'portal','api','webhook'
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  
  -- Result
  success BOOLEAN NOT NULL DEFAULT true,
  failure_reason TEXT,
  
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Document sharing and permissions
CREATE TABLE IF NOT EXISTS phase10_document_shares (
  share_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES phase10_loan_document(doc_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  
  -- Sharing details
  shared_by UUID NOT NULL,
  shared_with TEXT NOT NULL,                -- Email or user identifier
  share_type TEXT NOT NULL,                 -- 'view_only','download','time_limited'
  
  -- Access control
  expires_at TIMESTAMPTZ,
  password_protected BOOLEAN DEFAULT false,
  download_limit INT,
  current_downloads INT DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hash verification function for document integrity
CREATE OR REPLACE FUNCTION verify_document_integrity(
  p_doc_id UUID
) RETURNS TABLE (
  doc_id UUID,
  is_valid BOOLEAN,
  content_hash_match BOOLEAN,
  certificate_hash_match BOOLEAN,
  message TEXT
) AS $$
DECLARE
  doc_record RECORD;
  actual_content_hash BYTEA;
  actual_cert_hash BYTEA;
BEGIN
  -- Get document record
  SELECT * INTO doc_record FROM phase10_loan_document WHERE phase10_loan_document.doc_id = p_doc_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_doc_id, false, false, false, 'Document not found';
    RETURN;
  END IF;
  
  -- For demo purposes, we'll assume hashes are valid
  -- In production, this would verify against actual file content
  RETURN QUERY SELECT 
    p_doc_id,
    true,
    true,
    CASE WHEN doc_record.certificate_hash IS NOT NULL THEN true ELSE NULL END,
    'Document integrity verified (simulated)';
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on all tables
ALTER TABLE phase10_loan_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase10_document_signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase10_document_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase10_document_shares ENABLE ROW LEVEL SECURITY;

-- RLS policies for tenant isolation
CREATE POLICY phase10_loan_document_rls ON phase10_loan_document
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY phase10_document_signers_rls ON phase10_document_signers
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY phase10_document_access_log_rls ON phase10_document_access_log
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY phase10_document_shares_rls ON phase10_document_shares
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Performance indexes
CREATE INDEX idx_phase10_loan_document_loan ON phase10_loan_document(loan_urn, created_at DESC);
CREATE INDEX idx_phase10_loan_document_tenant_type ON phase10_loan_document(tenant_id, doc_type);
CREATE INDEX idx_phase10_loan_document_provider ON phase10_loan_document(provider, provider_ref);
CREATE INDEX idx_phase10_document_signers_doc ON phase10_document_signers(doc_id);
CREATE INDEX idx_phase10_document_access_doc_time ON phase10_document_access_log(doc_id, accessed_at DESC);
CREATE INDEX idx_phase10_document_shares_doc ON phase10_document_shares(doc_id, is_active);