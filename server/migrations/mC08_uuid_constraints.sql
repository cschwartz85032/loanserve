-- Migration mC08: Add UUID format CHECK constraints at database level
-- Addresses: "UUID format validation with regex constraints" gap

BEGIN;

-- Add UUID format constraints for all tenant_id columns
-- Using proper UUID regex pattern that matches PostgreSQL UUID format

-- Helper function to add constraints only if they don't exist
DO $$
BEGIN
  -- loan_candidates
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_loan_candidates_tenant_uuid') THEN
    ALTER TABLE loan_candidates ADD CONSTRAINT chk_loan_candidates_tenant_uuid 
      CHECK (tenant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
  END IF;

  -- imports  
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_imports_tenant_uuid') THEN
    ALTER TABLE imports ADD CONSTRAINT chk_imports_tenant_uuid
      CHECK (tenant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
  END IF;

  -- audit_logs (newly added tenant_id)
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_audit_logs_tenant_uuid') THEN
    ALTER TABLE audit_logs ADD CONSTRAINT chk_audit_logs_tenant_uuid
      CHECK (tenant_id IS NULL OR tenant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
  END IF;
END $$;

-- Add constraints for other tables that have tenant_id
DO $$
BEGIN
  -- loan_documents (through FK but might have direct tenant_id in future)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loan_documents' AND column_name = 'tenant_id') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_loan_documents_tenant_uuid') THEN
      ALTER TABLE loan_documents ADD CONSTRAINT chk_loan_documents_tenant_uuid
        CHECK (tenant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
    END IF;
  END IF;
  
  -- loan_datapoints  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loan_datapoints' AND column_name = 'tenant_id') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_loan_datapoints_tenant_uuid') THEN
      ALTER TABLE loan_datapoints ADD CONSTRAINT chk_loan_datapoints_tenant_uuid
        CHECK (tenant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
    END IF;
  END IF;
  
  -- monitoring_events (intentionally allows NULL per business rules)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'monitoring_events' AND column_name = 'tenant_id') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_monitoring_events_tenant_uuid') THEN
      ALTER TABLE monitoring_events ADD CONSTRAINT chk_monitoring_events_tenant_uuid
        CHECK (tenant_id IS NULL OR tenant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
    END IF;
  END IF;

  -- event_outbox (only if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'event_outbox') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_event_outbox_tenant_uuid') THEN
      ALTER TABLE event_outbox ADD CONSTRAINT chk_event_outbox_tenant_uuid
        CHECK (tenant_id IS NULL OR tenant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
    END IF;
  END IF;
END $$;

COMMIT;