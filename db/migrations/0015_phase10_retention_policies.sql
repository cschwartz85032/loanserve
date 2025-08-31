-- Phase 10: Data Retention and Secure Deletion Workflows
-- Implements automated retention policies and secure deletion with audit trails

-- Retention policy definitions
CREATE TABLE IF NOT EXISTS phase10_retention_policy (
  policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Policy identification
  policy_name TEXT NOT NULL,
  policy_version TEXT NOT NULL DEFAULT '1.0',
  description TEXT,
  
  -- Policy scope
  applies_to_resource_type TEXT NOT NULL,   -- 'document','consent','communication','audit'
  applies_to_category TEXT[],               -- Specific categories within resource type
  
  -- Retention rules
  retention_period_years INT,
  retention_period_months INT,
  retention_period_days INT,
  
  -- Trigger conditions
  retention_trigger TEXT NOT NULL DEFAULT 'creation_date', -- 'creation_date','completion_date','last_access','loan_closure'
  trigger_offset_days INT DEFAULT 0,       -- Days after trigger event
  
  -- Legal and regulatory basis
  legal_basis TEXT[],                       -- {"SOX","GDPR","state_law"}
  regulatory_requirements JSONB,            -- Specific regulatory details
  
  -- Actions on retention expiry
  action_on_expiry TEXT NOT NULL DEFAULT 'review', -- 'delete','archive','anonymize','review'
  deletion_method TEXT,                     -- 'secure_delete','crypto_delete','physical_destruction'
  anonymization_method TEXT,                -- 'k_anonymity','differential_privacy','suppression'
  
  -- Status and lifecycle
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_date DATE NOT NULL DEFAULT current_date,
  retirement_date DATE,
  
  -- Approval and governance
  approved_by UUID NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  review_required BOOLEAN DEFAULT false,
  next_review_date DATE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(tenant_id, policy_name, policy_version)
);

-- Retention schedule tracking
CREATE TABLE IF NOT EXISTS phase10_retention_schedule (
  schedule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  policy_id UUID NOT NULL REFERENCES phase10_retention_policy(policy_id),
  
  -- Resource being tracked
  resource_type TEXT NOT NULL,
  resource_id UUID NOT NULL,
  resource_urn TEXT NOT NULL,
  
  -- Schedule dates
  creation_date DATE NOT NULL,
  trigger_date DATE,                        -- Date when retention period starts
  expiry_date DATE NOT NULL,                -- Date when action should be taken
  
  -- Current status
  status TEXT NOT NULL DEFAULT 'active',    -- 'active','due','processing','completed','error','hold'
  hold_reason TEXT,                         -- Reason for legal hold
  hold_placed_by UUID,
  hold_placed_at TIMESTAMPTZ,
  
  -- Processing information
  last_checked_at TIMESTAMPTZ,
  next_check_date DATE,
  processing_attempts INT DEFAULT 0,
  last_error TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(tenant_id, resource_type, resource_id, policy_id)
);

-- Deletion audit trail
CREATE TABLE IF NOT EXISTS phase10_deletion_audit (
  deletion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- What was deleted
  resource_type TEXT NOT NULL,
  resource_id UUID NOT NULL,
  resource_urn TEXT NOT NULL,
  
  -- Why was it deleted
  retention_policy_id UUID REFERENCES phase10_retention_policy(policy_id),
  deletion_reason TEXT NOT NULL,            -- 'retention_expiry','user_request','court_order','error_correction'
  legal_basis TEXT,
  
  -- How was it deleted
  deletion_method TEXT NOT NULL,            -- 'soft_delete','secure_delete','crypto_delete','anonymization'
  deletion_proof_hash BYTEA,                -- Cryptographic proof of deletion
  
  -- Pre-deletion state (for audit)
  resource_metadata JSONB,                  -- Non-sensitive metadata about deleted resource
  resource_hash BYTEA,                      -- Hash of deleted content (for integrity verification)
  backup_location TEXT,                     -- Where backup is stored (if any)
  
  -- Authorization and approval
  authorized_by UUID NOT NULL,
  approval_required BOOLEAN DEFAULT false,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  
  -- Processing details
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verification_completed_at TIMESTAMPTZ,
  verification_status TEXT DEFAULT 'pending', -- 'pending','verified','failed'
  
  -- Related deletions (cascade effects)
  parent_deletion_id UUID REFERENCES phase10_deletion_audit(deletion_id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Legal holds (prevents deletion during litigation, etc.)
CREATE TABLE IF NOT EXISTS phase10_legal_hold (
  hold_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Hold identification
  hold_name TEXT NOT NULL,
  case_reference TEXT,
  matter_description TEXT,
  
  -- Scope of hold
  resource_filters JSONB NOT NULL,          -- Criteria for what's included in hold
  custodian_list TEXT[],                    -- List of data custodians
  
  -- Hold lifecycle
  issued_by UUID NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_date DATE NOT NULL DEFAULT current_date,
  release_date DATE,
  released_by UUID,
  released_at TIMESTAMPTZ,
  
  -- Status and notifications
  status TEXT NOT NULL DEFAULT 'active',    -- 'active','released','expired'
  notification_sent BOOLEAN DEFAULT false,
  acknowledgments_received JSONB DEFAULT '[]',
  
  -- Legal details
  legal_counsel TEXT,
  court_jurisdiction TEXT,
  preservation_notice_text TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Function to apply retention schedule to new resources
CREATE OR REPLACE FUNCTION apply_retention_policies(
  p_tenant_id UUID,
  p_resource_type TEXT,
  p_resource_id UUID,
  p_resource_urn TEXT,
  p_creation_date DATE DEFAULT current_date,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS INT AS $$
DECLARE
  policy RECORD;
  v_trigger_date DATE;
  v_expiry_date DATE;
  policies_applied INT := 0;
BEGIN
  -- Find applicable policies
  FOR policy IN 
    SELECT * FROM phase10_retention_policy 
    WHERE tenant_id = p_tenant_id 
      AND applies_to_resource_type = p_resource_type
      AND is_active = true
      AND effective_date <= current_date
      AND (retirement_date IS NULL OR retirement_date > current_date)
  LOOP
    -- Calculate trigger date
    CASE policy.retention_trigger
      WHEN 'creation_date' THEN
        v_trigger_date := p_creation_date + INTERVAL '1 day' * COALESCE(policy.trigger_offset_days, 0);
      WHEN 'completion_date' THEN
        -- For now, use creation date + offset (could be enhanced with actual completion date)
        v_trigger_date := p_creation_date + INTERVAL '1 day' * COALESCE(policy.trigger_offset_days, 0);
      ELSE
        v_trigger_date := p_creation_date + INTERVAL '1 day' * COALESCE(policy.trigger_offset_days, 0);
    END CASE;
    
    -- Calculate expiry date
    v_expiry_date := v_trigger_date;
    IF policy.retention_period_years IS NOT NULL THEN
      v_expiry_date := v_expiry_date + INTERVAL '1 year' * policy.retention_period_years;
    END IF;
    IF policy.retention_period_months IS NOT NULL THEN
      v_expiry_date := v_expiry_date + INTERVAL '1 month' * policy.retention_period_months;
    END IF;
    IF policy.retention_period_days IS NOT NULL THEN
      v_expiry_date := v_expiry_date + INTERVAL '1 day' * policy.retention_period_days;
    END IF;
    
    -- Insert retention schedule
    INSERT INTO phase10_retention_schedule (
      tenant_id, policy_id, resource_type, resource_id, resource_urn,
      creation_date, trigger_date, expiry_date, next_check_date, metadata
    ) VALUES (
      p_tenant_id, policy.policy_id, p_resource_type, p_resource_id, p_resource_urn,
      p_creation_date, v_trigger_date, v_expiry_date, v_expiry_date - INTERVAL '30 days', p_metadata
    );
    
    policies_applied := policies_applied + 1;
  END LOOP;
  
  RETURN policies_applied;
END;
$$ LANGUAGE plpgsql;

-- Function to process due retention items
CREATE OR REPLACE FUNCTION process_retention_due_items(
  p_tenant_id UUID,
  p_batch_size INT DEFAULT 100
) RETURNS TABLE (
  processed INT,
  deleted INT,
  errors INT,
  on_hold INT
) AS $$
DECLARE
  schedule_record RECORD;
  total_processed INT := 0;
  total_deleted INT := 0;
  total_errors INT := 0;
  total_on_hold INT := 0;
  policy_record RECORD;
BEGIN
  -- Process due retention items
  FOR schedule_record IN 
    SELECT rs.*, rp.action_on_expiry, rp.deletion_method
    FROM phase10_retention_schedule rs
    JOIN phase10_retention_policy rp ON rs.policy_id = rp.policy_id
    WHERE rs.tenant_id = p_tenant_id 
      AND rs.status = 'due'
      AND rs.expiry_date <= current_date
      AND NOT EXISTS (
        SELECT 1 FROM phase10_legal_hold lh 
        WHERE lh.tenant_id = p_tenant_id 
          AND lh.status = 'active'
          -- Simple filter match - in production would be more sophisticated
      )
    LIMIT p_batch_size
  LOOP
    BEGIN
      total_processed := total_processed + 1;
      
      -- Check for legal holds
      IF EXISTS (
        SELECT 1 FROM phase10_legal_hold 
        WHERE tenant_id = p_tenant_id AND status = 'active'
      ) THEN
        UPDATE phase10_retention_schedule 
        SET status = 'hold', updated_at = now()
        WHERE schedule_id = schedule_record.schedule_id;
        total_on_hold := total_on_hold + 1;
        CONTINUE;
      END IF;
      
      -- Process based on policy action
      CASE schedule_record.action_on_expiry
        WHEN 'delete' THEN
          -- Create deletion audit record
          INSERT INTO phase10_deletion_audit (
            tenant_id, resource_type, resource_id, resource_urn,
            retention_policy_id, deletion_reason, deletion_method, authorized_by
          ) VALUES (
            p_tenant_id, schedule_record.resource_type, schedule_record.resource_id, 
            schedule_record.resource_urn, schedule_record.policy_id, 
            'retention_expiry', COALESCE(schedule_record.deletion_method, 'soft_delete'),
            '00000000-0000-0000-0000-000000000001'::uuid -- System user
          );
          
          total_deleted := total_deleted + 1;
          
        WHEN 'review' THEN
          -- Mark for manual review
          UPDATE phase10_retention_schedule 
          SET status = 'review_required', updated_at = now()
          WHERE schedule_id = schedule_record.schedule_id;
          
        ELSE
          -- Default: mark as completed for manual handling
          UPDATE phase10_retention_schedule 
          SET status = 'completed', updated_at = now()
          WHERE schedule_id = schedule_record.schedule_id;
      END CASE;
      
      -- Update schedule status
      UPDATE phase10_retention_schedule 
      SET status = 'completed', last_checked_at = now(), updated_at = now()
      WHERE schedule_id = schedule_record.schedule_id;
      
    EXCEPTION WHEN OTHERS THEN
      -- Handle errors
      UPDATE phase10_retention_schedule 
      SET status = 'error', 
          last_error = SQLERRM,
          processing_attempts = processing_attempts + 1,
          updated_at = now()
      WHERE schedule_id = schedule_record.schedule_id;
      
      total_errors := total_errors + 1;
    END;
  END LOOP;
  
  RETURN QUERY SELECT total_processed, total_deleted, total_errors, total_on_hold;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE phase10_retention_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase10_retention_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase10_deletion_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase10_legal_hold ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY phase10_retention_policy_rls ON phase10_retention_policy
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY phase10_retention_schedule_rls ON phase10_retention_schedule
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY phase10_deletion_audit_rls ON phase10_deletion_audit
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY phase10_legal_hold_rls ON phase10_legal_hold
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Performance indexes
CREATE INDEX idx_phase10_retention_policy_resource ON phase10_retention_policy(applies_to_resource_type, is_active);
CREATE INDEX idx_phase10_retention_schedule_due ON phase10_retention_schedule(tenant_id, expiry_date, status);
CREATE INDEX idx_phase10_retention_schedule_resource ON phase10_retention_schedule(resource_type, resource_id);
CREATE INDEX idx_phase10_deletion_audit_resource ON phase10_deletion_audit(resource_type, resource_id);
CREATE INDEX idx_phase10_legal_hold_status ON phase10_legal_hold(tenant_id, status, effective_date);