-- Security Hardening Migration
-- Creates tables for ABAC, PII encryption, wire fraud protection, and audit chain

BEGIN;

-- ABAC: Loan Access Control Lists
CREATE TABLE IF NOT EXISTS loan_acl (
  tenant_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  user_sub text NOT NULL,                 -- OIDC/JWT subject identifier
  roles text[] NOT NULL DEFAULT ARRAY['viewer'],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, loan_id, user_sub)
);

CREATE INDEX IF NOT EXISTS idx_loan_acl_tenant ON loan_acl(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loan_acl_user ON loan_acl(user_sub);
CREATE INDEX IF NOT EXISTS idx_loan_acl_loan ON loan_acl(loan_id);

-- Enable RLS for loan ACL
ALTER TABLE loan_acl ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS p_loan_acl_tenant ON loan_acl
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- PII: Encrypted Borrower Data
CREATE TABLE IF NOT EXISTS pii_borrowers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  
  -- Encrypted fields (base64 AEAD payloads)
  email_enc text NULL,
  phone_enc text NULL,
  ssn_last4_enc text NULL,
  dob_enc text NULL,
  full_name_enc text NULL,
  
  -- Tokenized fields for search (SHA-256 hashes)
  email_tok text NULL,
  phone_tok text NULL,
  ssn_last4_tok text NULL,
  full_name_tok text NULL,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(tenant_id, loan_id)
);

CREATE INDEX IF NOT EXISTS idx_pii_borrowers_tenant ON pii_borrowers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pii_borrowers_loan ON pii_borrowers(loan_id);
CREATE INDEX IF NOT EXISTS idx_pii_borrowers_email_tok ON pii_borrowers(email_tok);
CREATE INDEX IF NOT EXISTS idx_pii_borrowers_phone_tok ON pii_borrowers(phone_tok);
CREATE INDEX IF NOT EXISTS idx_pii_borrowers_name_tok ON pii_borrowers(full_name_tok);

-- Enable RLS for PII
ALTER TABLE pii_borrowers ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS p_pii_borrowers_tenant ON pii_borrowers
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- Wire Transfer Requests
CREATE TABLE IF NOT EXISTS wire_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  
  -- Transfer details
  amount numeric(15,2) NOT NULL,
  recipient_name text NOT NULL,
  recipient_bank text NOT NULL,
  recipient_account text NOT NULL,
  recipient_routing text NOT NULL,
  purpose text NOT NULL,
  
  -- Request metadata
  requested_by text NOT NULL,             -- User sub who requested
  status text NOT NULL DEFAULT 'pending', -- pending, approved, rejected, executed, cancelled
  
  -- Risk assessment
  risk_score integer DEFAULT 0,          -- 0-100 scale
  risk_flags text[] DEFAULT ARRAY[]::text[],
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz NULL,
  rejected_at timestamptz NULL,
  executed_at timestamptz NULL,
  
  CONSTRAINT wire_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_wire_requests_tenant ON wire_transfer_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wire_requests_status ON wire_transfer_requests(status);
CREATE INDEX IF NOT EXISTS idx_wire_requests_requester ON wire_transfer_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_wire_requests_created ON wire_transfer_requests(created_at);

-- Enable RLS for wire transfers
ALTER TABLE wire_transfer_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS p_wire_requests_tenant ON wire_transfer_requests
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- Wire Transfer Approvals
CREATE TABLE IF NOT EXISTS wire_transfer_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wire_id uuid NOT NULL REFERENCES wire_transfer_requests(id) ON DELETE CASCADE,
  
  -- Approver details
  approver_sub text NOT NULL,             -- User sub who approved/rejected
  approver_role text NOT NULL,            -- Role at time of approval
  action text NOT NULL,                   -- approve, reject
  reason text NULL,
  
  -- Security metadata
  ip_address inet NULL,
  user_agent text NULL,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT wire_approval_action_check CHECK (action IN ('approve', 'reject'))
);

CREATE INDEX IF NOT EXISTS idx_wire_approvals_wire ON wire_transfer_approvals(wire_id);
CREATE INDEX IF NOT EXISTS idx_wire_approvals_approver ON wire_transfer_approvals(approver_sub);
CREATE INDEX IF NOT EXISTS idx_wire_approvals_action ON wire_transfer_approvals(action);

-- Tamper-Evident Audit Chain
CREATE TABLE IF NOT EXISTS audit_chain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  
  -- Event details
  event_type text NOT NULL,
  actor_type text NOT NULL,               -- user, system, service
  actor_id text NOT NULL,                 -- User sub or system identifier
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}',
  
  -- Timestamps
  timestamp timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Chain integrity
  previous_hash text NOT NULL,            -- Hash of previous event
  event_hash text NOT NULL,               -- Hash of this event
  chain_sequence bigint NOT NULL,         -- Sequence number in chain
  
  UNIQUE(tenant_id, chain_sequence)
);

CREATE INDEX IF NOT EXISTS idx_audit_chain_tenant ON audit_chain_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_chain_sequence ON audit_chain_events(tenant_id, chain_sequence);
CREATE INDEX IF NOT EXISTS idx_audit_chain_timestamp ON audit_chain_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_chain_resource ON audit_chain_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_chain_event_type ON audit_chain_events(event_type);

-- Enable RLS for audit chain
ALTER TABLE audit_chain_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS p_audit_chain_tenant ON audit_chain_events
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- Data Retention Policies
CREATE TABLE IF NOT EXISTS retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  
  -- Policy details
  table_name text NOT NULL,
  retention_days integer NOT NULL DEFAULT 3650,  -- 10 years default
  policy_type text NOT NULL DEFAULT 'automatic', -- automatic, manual, legal_hold
  
  -- Legal hold support
  legal_hold_reason text NULL,
  legal_hold_until timestamptz NULL,
  
  -- Policy metadata
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(tenant_id, table_name)
);

CREATE INDEX IF NOT EXISTS idx_retention_policies_tenant ON retention_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_retention_policies_table ON retention_policies(table_name);
CREATE INDEX IF NOT EXISTS idx_retention_policies_type ON retention_policies(policy_type);

-- Data Retention Log (track what was purged)
CREATE TABLE IF NOT EXISTS retention_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  
  -- Retention operation details
  table_name text NOT NULL,
  operation_type text NOT NULL,           -- purge, archive, legal_hold_applied
  records_affected integer NOT NULL DEFAULT 0,
  date_range_start timestamptz NOT NULL,
  date_range_end timestamptz NOT NULL,
  
  -- Audit trail
  executed_by text NOT NULL,              -- System or user sub
  execution_reason text NOT NULL,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retention_log_tenant ON retention_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_retention_log_table ON retention_log(table_name);
CREATE INDEX IF NOT EXISTS idx_retention_log_operation ON retention_log(operation_type);
CREATE INDEX IF NOT EXISTS idx_retention_log_created ON retention_log(created_at);

-- Session Security (enhanced session table if not exists)
CREATE TABLE IF NOT EXISTS secure_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text UNIQUE NOT NULL,
  
  -- Session data
  user_sub text NOT NULL,
  tenant_id uuid NOT NULL,
  user_roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  
  -- Security metadata
  ip_address inet NOT NULL,
  user_agent text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_accessed timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  
  -- Security flags
  is_mfa_verified boolean NOT NULL DEFAULT false,
  security_level text NOT NULL DEFAULT 'standard', -- standard, elevated, admin
  
  -- Revocation support
  is_revoked boolean NOT NULL DEFAULT false,
  revoked_at timestamptz NULL,
  revoked_reason text NULL
);

CREATE INDEX IF NOT EXISTS idx_secure_sessions_session_id ON secure_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_secure_sessions_user ON secure_sessions(user_sub);
CREATE INDEX IF NOT EXISTS idx_secure_sessions_tenant ON secure_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_secure_sessions_expires ON secure_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_secure_sessions_revoked ON secure_sessions(is_revoked);

COMMIT;