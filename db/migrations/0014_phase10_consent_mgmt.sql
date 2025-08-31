-- Phase 10: Enhanced Consent & Communication Preference Management
-- Tracks consent with external provider integration and evidence custody

-- Enhanced consent records with external source tracking
CREATE TABLE IF NOT EXISTS phase10_consent_record (
  consent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  subject_urn TEXT NOT NULL,                -- urn:borrower:<id>, urn:person:<id>
  
  -- Consent details
  consent_type TEXT NOT NULL,               -- 'e-sign','privacy_notice','marketing','servicing','data_processing'
  consent_version TEXT NOT NULL,            -- Version of consent form/agreement
  consent_scope TEXT[],                     -- Array of specific consent scopes
  
  -- Grant/revoke status
  granted BOOLEAN NOT NULL,
  purpose TEXT[],                           -- {"servicing","marketing","analytics","third_party"}
  channel TEXT[],                           -- {"email","sms","phone","mail","portal","push"}
  
  -- Evidence and verification
  evidence_locator TEXT,                    -- Our document/certificate pointer
  immutable_hash BYTEA NOT NULL,            -- Hash of evidence snapshot
  obtained_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  
  -- External provider integration
  source TEXT NOT NULL DEFAULT 'internal', -- 'docusign'|'internal'|'adobe_sign'|'hellosign'|'other'
  external_reference TEXT,                 -- DocuSign Envelope ID, etc.
  external_status TEXT,                     -- 'created'|'sent'|'completed'|'declined'|'voided'
  provider_payload_hash BYTEA,             -- Hash of signed provider payload
  provider_webhook_received_at TIMESTAMPTZ,
  
  -- Context and metadata
  ip_address INET,
  user_agent TEXT,
  device_fingerprint TEXT,
  geolocation JSONB,                        -- {"country": "US", "region": "CA", "city": "SF"}
  
  -- Legal and compliance
  legal_basis TEXT,                         -- GDPR legal basis: 'consent','contract','legal_obligation', etc.
  regulatory_framework TEXT[],              -- {"GDPR","CCPA","PIPEDA","SOX"}
  retention_period_months INT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Communication preferences with fine-grained control
CREATE TABLE IF NOT EXISTS phase10_communication_preference (
  pref_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  subject_urn TEXT NOT NULL,
  
  -- Communication channel and purpose
  channel TEXT NOT NULL,                    -- 'email'|'sms'|'phone'|'mail'|'portal'|'push'
  purpose TEXT NOT NULL,                    -- 'servicing'|'marketing'|'alerts'|'statements'|'collections'
  sub_purpose TEXT,                         -- More specific: 'payment_reminders','promotional','newsletters'
  
  -- Preference settings
  frequency TEXT NOT NULL,                  -- 'immediate'|'daily'|'weekly'|'monthly'|'optout'|'custom'
  custom_schedule JSONB,                    -- For custom frequency: {"days": ["mon","wed"], "time": "09:00"}
  
  -- Contact information (encrypted)
  contact_value_encrypted BYTEA,            -- Encrypted email/phone/address
  contact_value_hash BYTEA,                 -- Hash for equality lookups without decryption
  is_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  
  -- Status and lifecycle
  is_active BOOLEAN DEFAULT true,
  paused_until TIMESTAMPTZ,
  
  -- Consent linkage
  consent_id UUID REFERENCES phase10_consent_record(consent_id),
  consent_obtained_at TIMESTAMPTZ,
  
  -- Compliance and tracking
  source_of_preference TEXT DEFAULT 'user', -- 'user'|'system'|'import'|'inference'
  last_honored_at TIMESTAMPTZ,              -- When we last sent communication respecting this preference
  violation_count INT DEFAULT 0,            -- Track accidental violations
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (tenant_id, subject_urn, channel, purpose, sub_purpose)
);

-- Consent history for audit trail
CREATE TABLE IF NOT EXISTS phase10_consent_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id UUID NOT NULL REFERENCES phase10_consent_record(consent_id),
  tenant_id UUID NOT NULL,
  
  -- Change details
  change_type TEXT NOT NULL,                -- 'granted','revoked','modified','expired','renewed'
  changed_by UUID,                          -- User who made the change (if manual)
  change_reason TEXT,
  
  -- Previous state (for rollback capability)
  previous_state JSONB,
  new_state JSONB,
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Communication events log (what we actually sent)
CREATE TABLE IF NOT EXISTS phase10_communication_log (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  subject_urn TEXT NOT NULL,
  
  -- Communication details
  channel TEXT NOT NULL,
  purpose TEXT NOT NULL,
  sub_purpose TEXT,
  
  -- Message details
  template_id TEXT,
  subject_line TEXT,
  message_preview TEXT,                     -- First 100 chars for audit
  
  -- Delivery information
  recipient_address_hash BYTEA,             -- Hash of recipient address for privacy
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  bounce_reason TEXT,
  
  -- Preference compliance
  preference_id UUID REFERENCES phase10_communication_preference(pref_id),
  consent_id UUID REFERENCES phase10_consent_record(consent_id),
  compliance_status TEXT NOT NULL DEFAULT 'compliant', -- 'compliant'|'violation'|'suppressed'
  suppression_reason TEXT,
  
  -- External provider tracking
  provider TEXT,                            -- 'sendgrid'|'twilio'|'ses'|'internal'
  provider_message_id TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Functions for consent management
CREATE OR REPLACE FUNCTION grant_consent(
  p_tenant_id UUID,
  p_subject_urn TEXT,
  p_consent_type TEXT,
  p_consent_version TEXT,
  p_purpose TEXT[],
  p_channel TEXT[],
  p_evidence_locator TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_consent_id UUID := gen_random_uuid();
  v_evidence_hash BYTEA;
BEGIN
  -- Calculate evidence hash
  v_evidence_hash := digest(
    COALESCE(p_evidence_locator, '') || p_consent_type || p_consent_version || array_to_string(p_purpose, ','), 
    'sha256'
  );
  
  -- Insert consent record
  INSERT INTO phase10_consent_record (
    consent_id, tenant_id, subject_urn, consent_type, consent_version,
    granted, purpose, channel, evidence_locator, immutable_hash,
    obtained_at, ip_address, user_agent
  ) VALUES (
    v_consent_id, p_tenant_id, p_subject_urn, p_consent_type, p_consent_version,
    true, p_purpose, p_channel, p_evidence_locator, v_evidence_hash,
    now(), p_ip_address, p_user_agent
  );
  
  -- Log the consent grant
  INSERT INTO phase10_consent_history (
    consent_id, tenant_id, change_type, new_state, ip_address, user_agent
  ) VALUES (
    v_consent_id, p_tenant_id, 'granted',
    jsonb_build_object(
      'granted', true,
      'purpose', p_purpose,
      'channel', p_channel,
      'granted_at', now()
    ),
    p_ip_address, p_user_agent
  );
  
  RETURN v_consent_id;
END;
$$ LANGUAGE plpgsql;

-- Function to revoke consent
CREATE OR REPLACE FUNCTION revoke_consent(
  p_consent_id UUID,
  p_revoked_by UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_consent_record RECORD;
BEGIN
  -- Get current consent record
  SELECT * INTO v_consent_record FROM phase10_consent_record WHERE consent_id = p_consent_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consent record not found: %', p_consent_id;
  END IF;
  
  IF NOT v_consent_record.granted THEN
    RAISE EXCEPTION 'Consent already revoked: %', p_consent_id;
  END IF;
  
  -- Update consent record
  UPDATE phase10_consent_record 
  SET granted = false, revoked_at = now(), updated_at = now()
  WHERE consent_id = p_consent_id;
  
  -- Log the revocation
  INSERT INTO phase10_consent_history (
    consent_id, tenant_id, change_type, changed_by, change_reason,
    previous_state, new_state, ip_address, user_agent
  ) VALUES (
    p_consent_id, v_consent_record.tenant_id, 'revoked', p_revoked_by, p_reason,
    jsonb_build_object('granted', true, 'revoked_at', NULL),
    jsonb_build_object('granted', false, 'revoked_at', now()),
    p_ip_address, p_user_agent
  );
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on all tables
ALTER TABLE phase10_consent_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase10_communication_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase10_consent_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase10_communication_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for tenant isolation
CREATE POLICY phase10_consent_record_rls ON phase10_consent_record
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY phase10_communication_preference_rls ON phase10_communication_preference
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY phase10_consent_history_rls ON phase10_consent_history
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY phase10_communication_log_rls ON phase10_communication_log
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Performance indexes
CREATE INDEX idx_phase10_consent_subject ON phase10_consent_record(subject_urn, granted);
CREATE INDEX idx_phase10_consent_type ON phase10_consent_record(tenant_id, consent_type, granted);
CREATE INDEX idx_phase10_consent_external ON phase10_consent_record(source, external_reference);
CREATE INDEX idx_phase10_comm_pref_subject ON phase10_communication_preference(subject_urn, is_active);
CREATE INDEX idx_phase10_comm_pref_channel ON phase10_communication_preference(tenant_id, channel, purpose);
CREATE INDEX idx_phase10_comm_log_subject_time ON phase10_communication_log(subject_urn, sent_at DESC);
CREATE INDEX idx_phase10_consent_history_consent ON phase10_consent_history(consent_id, created_at DESC);