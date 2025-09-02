-- AI Servicing Pipeline RLS Policies
-- Multi-tenant security with Phase 10 integration
BEGIN;

-- Enable RLS on all AI pipeline tables
ALTER TABLE loan_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_datapoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_defects ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_events ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tenant isolation
-- Assumes app.tenant_id is set per connection/session

-- Loan candidates - tenant isolation
CREATE POLICY p_loan_candidates_tenant ON loan_candidates 
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- Loan documents - via loan candidate tenant
CREATE POLICY p_loan_documents_tenant ON loan_documents 
  USING (loan_id IN (
    SELECT id FROM loan_candidates 
    WHERE tenant_id::text = current_setting('app.tenant_id', true)
  ));

-- Loan datapoints - via loan candidate tenant
CREATE POLICY p_loan_datapoints_tenant ON loan_datapoints 
  USING (loan_id IN (
    SELECT id FROM loan_candidates 
    WHERE tenant_id::text = current_setting('app.tenant_id', true)
  ));

-- Loan conflicts - via loan candidate tenant
CREATE POLICY p_loan_conflicts_tenant ON loan_conflicts 
  USING (loan_id IN (
    SELECT id FROM loan_candidates 
    WHERE tenant_id::text = current_setting('app.tenant_id', true)
  ));

-- Imports - direct tenant isolation
CREATE POLICY p_imports_tenant ON imports 
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- Import errors - via imports tenant
CREATE POLICY p_import_errors_tenant ON import_errors 
  USING (import_id IN (
    SELECT id FROM imports 
    WHERE tenant_id::text = current_setting('app.tenant_id', true)
  ));

-- Import mappings - via imports tenant
CREATE POLICY p_import_mappings_tenant ON import_mappings 
  USING (import_id IN (
    SELECT id FROM imports 
    WHERE tenant_id::text = current_setting('app.tenant_id', true)
  ));

-- QC rules - global or tenant-specific
CREATE POLICY p_qc_rules_access ON qc_rules 
  USING (true); -- QC rules are typically global, can be refined

-- QC defects - via loan candidate tenant
CREATE POLICY p_qc_defects_tenant ON qc_defects 
  USING (loan_id IN (
    SELECT id FROM loan_candidates 
    WHERE tenant_id::text = current_setting('app.tenant_id', true)
  ));

-- Lineage records - via document tenant (if document exists) or open access for system lineage
CREATE POLICY p_lineage_records_tenant ON lineage_records 
  USING (
    document_id IS NULL OR  -- System-generated lineage
    document_id IN (
      SELECT ld.id FROM loan_documents ld
      JOIN loan_candidates lc ON ld.loan_id = lc.id
      WHERE lc.tenant_id::text = current_setting('app.tenant_id', true)
    )
  );

-- Worker status - system-wide visibility for monitoring
CREATE POLICY p_worker_status_access ON worker_status 
  USING (true); -- Workers are system-wide

-- Pipeline alerts - system-wide visibility for monitoring
CREATE POLICY p_pipeline_alerts_access ON pipeline_alerts 
  USING (true); -- Alerts are system-wide

-- Audits - tenant isolation or system audits
CREATE POLICY p_audits_tenant ON audits 
  USING (
    -- System audits are visible to all
    target_type = 'system' OR
    -- Tenant-specific audits
    target_id IN (
      SELECT id FROM loan_candidates 
      WHERE tenant_id::text = current_setting('app.tenant_id', true)
    )
  );

-- Event outbox - tenant isolation via aggregate
CREATE POLICY p_event_outbox_tenant ON event_outbox 
  USING (
    aggregate_id IN (
      SELECT id FROM loan_candidates 
      WHERE tenant_id::text = current_setting('app.tenant_id', true)
    )
  );

-- Monitoring events - tenant isolation
CREATE POLICY p_monitoring_events_tenant ON monitoring_events 
  USING (
    tenant_id IS NULL OR  -- System-wide metrics
    tenant_id::text = current_setting('app.tenant_id', true)
  );

-- Additional security functions for role-based access

-- Function to check if user has AI pipeline admin role
CREATE OR REPLACE FUNCTION has_ai_pipeline_admin()
RETURNS boolean AS $$
BEGIN
  -- Integration with Phase 10 security system
  -- This would check against the security_user_roles table
  RETURN EXISTS (
    SELECT 1 FROM security_user_roles sur
    JOIN security_roles sr ON sur.role_id = sr.id
    WHERE sur.user_id::text = current_setting('app.user_id', true)
    AND sr.name IN ('ai_pipeline_admin', 'system_admin')
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can access AI pipeline data
CREATE OR REPLACE FUNCTION can_access_ai_pipeline()
RETURNS boolean AS $$
BEGIN
  -- Check if user has appropriate role or permissions
  RETURN EXISTS (
    SELECT 1 FROM security_user_roles sur
    JOIN security_roles sr ON sur.role_id = sr.id
    WHERE sur.user_id::text = current_setting('app.user_id', true)
    AND sr.name IN ('ai_pipeline_admin', 'ai_pipeline_user', 'loan_processor', 'system_admin')
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced policies with role-based access control

-- Admin override policies for troubleshooting
CREATE POLICY p_loan_candidates_admin ON loan_candidates 
  USING (has_ai_pipeline_admin());

CREATE POLICY p_imports_admin ON imports 
  USING (has_ai_pipeline_admin());

-- Grant appropriate permissions to AI pipeline roles
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ai_pipeline_service;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ai_pipeline_service;

-- Create application role for AI pipeline service
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_pipeline_service') THEN
    CREATE ROLE ai_pipeline_service;
  END IF;
END
$$;

-- Set up row-level security bypass for service role (with proper constraints)
ALTER TABLE loan_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE loan_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE loan_datapoints FORCE ROW LEVEL SECURITY;
ALTER TABLE loan_conflicts FORCE ROW LEVEL SECURITY;
ALTER TABLE imports FORCE ROW LEVEL SECURITY;

COMMIT;