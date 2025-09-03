-- Migration mC07: Add actual tenant_id columns to audit and event tables
-- Addresses: "Tenant context on audit/outbox tables" gap

BEGIN;

-- Add tenant_id column to audit_logs table
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- Add tenant_id column to event_outbox table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'event_outbox') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_outbox' AND column_name = 'tenant_id') THEN
      ALTER TABLE event_outbox ADD COLUMN tenant_id uuid;
    END IF;
  END IF;
END $$;

-- Add indexes for performance  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs (tenant_id, created_at);

-- Add event_outbox index only if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'event_outbox') THEN
    EXECUTE 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_outbox_tenant_id ON event_outbox (tenant_id, created_at)';
  END IF;
END $$;

-- Update existing RLS policies to use direct tenant_id columns instead of JSON lookups
-- This provides better performance and clearer intent

-- Drop existing RLS policies
DROP POLICY IF EXISTS p_aud_tenant ON audits;
DROP POLICY IF EXISTS p_outbox_tenant ON event_outbox;

-- Create new RLS policies using direct tenant_id columns
-- Enable RLS on audit_logs if not already enabled
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
    EXECUTE 'ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_audit_logs_tenant ON audit_logs';
    EXECUTE 'CREATE POLICY p_audit_logs_tenant ON audit_logs USING (tenant_id::text = current_setting(''app.tenant_id'', true))';
  END IF;
END $$;

-- For event_outbox with direct tenant_id column (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'event_outbox') THEN
    EXECUTE 'ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_outbox_tenant ON event_outbox';
    EXECUTE 'CREATE POLICY p_outbox_tenant_direct ON event_outbox USING (tenant_id::text = current_setting(''app.tenant_id'', true))';
  END IF;
END $$;

COMMIT;