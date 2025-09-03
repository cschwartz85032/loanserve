-- Migration C03: Ensure tenant context on audit & outbox for RLS
-- Addresses: Audit/outbox tables lack proper tenant enforcement for RLS
-- NON-NEGOTIABLE: Required for complete tenant isolation

BEGIN;

-- If audits lacks tenant context in metadata, add a tenant_id column for policy simplicity
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audits' AND column_name='tenant_id') THEN
    ALTER TABLE audits ADD COLUMN tenant_id uuid NULL;
    -- Backfill from metadata if possible
    UPDATE audits SET tenant_id = (metadata->>'tenant_id')::uuid WHERE metadata ? 'tenant_id';
    -- Future writes should populate audits.tenant_id directly.
  END IF;
END$$;

-- If event_outbox lacks tenant context in payload, add a column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_outbox' AND column_name='tenant_id') THEN
    ALTER TABLE event_outbox ADD COLUMN tenant_id uuid NULL;
    -- Backfill from payload if possible
    UPDATE event_outbox SET tenant_id = (payload->>'tenant_id')::uuid WHERE payload ? 'tenant_id';
    -- Future writes should populate event_outbox.tenant_id directly.
  END IF;
END$$;

-- Add tenant_id to monitoring_events if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='monitoring_events') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='monitoring_events' AND column_name='tenant_id') THEN
      EXECUTE 'ALTER TABLE monitoring_events ADD COLUMN tenant_id uuid NULL';
      EXECUTE $$UPDATE monitoring_events SET tenant_id = (dim->>'tenant_id')::uuid WHERE dim ? 'tenant_id'$$;
    END IF;
  END IF;
END$$;

-- Add tenant_id to lineage_records if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='lineage_records') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lineage_records' AND column_name='tenant_id') THEN
      EXECUTE 'ALTER TABLE lineage_records ADD COLUMN tenant_id uuid NULL';
      EXECUTE $$UPDATE lineage_records SET tenant_id = (metadata->>'tenant_id')::uuid WHERE metadata ? 'tenant_id'$$;
    END IF;
  END IF;
END$$;

-- Ensure RLS is enabled
ALTER TABLE audits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_outbox    ENABLE ROW LEVEL SECURITY;

-- Update RLS policies to use tenant columns for better performance
DROP POLICY IF EXISTS p_aud_tenant ON audits;
CREATE POLICY p_aud_tenant ON audits       USING (tenant_id::text = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS p_outbox_tenant ON event_outbox;
CREATE POLICY p_outbox_tenant ON event_outbox USING (tenant_id::text = current_setting('app.tenant_id', true));

-- Create performance indexes on tenant columns
CREATE INDEX IF NOT EXISTS idx_aud_tenant_on_col    ON audits(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_tenant_on_col ON event_outbox(tenant_id) WHERE tenant_id IS NOT NULL;

-- Helper table policies and indexes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='monitoring_events') THEN
    EXECUTE 'ALTER TABLE monitoring_events ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_mon_tenant ON monitoring_events';
    EXECUTE $$CREATE POLICY p_mon_tenant ON monitoring_events USING (tenant_id::text = current_setting('app.tenant_id', true))$$;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_mon_tenant_on_col ON monitoring_events(tenant_id) WHERE tenant_id IS NOT NULL';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='lineage_records') THEN
    EXECUTE 'ALTER TABLE lineage_records ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_lineage_tenant ON lineage_records';
    EXECUTE $$CREATE POLICY p_lineage_tenant ON lineage_records USING (tenant_id::text = current_setting('app.tenant_id', true))$$;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_lineage_tenant_on_col ON lineage_records(tenant_id) WHERE tenant_id IS NOT NULL';
  END IF;
END$$;

-- Add constraints for data integrity
ALTER TABLE audits ADD CONSTRAINT chk_audit_has_tenant_context 
  CHECK (tenant_id IS NOT NULL OR (metadata ? 'tenant_id'));

ALTER TABLE event_outbox ADD CONSTRAINT chk_outbox_has_tenant_context 
  CHECK (tenant_id IS NOT NULL OR (payload ? 'tenant_id'));

COMMIT;

-- Verification: Check tenant columns and RLS status
SELECT 
  t.table_name,
  c.column_name,
  p.rowsecurity,
  COUNT(pol.policyname) as policy_count
FROM information_schema.tables t
LEFT JOIN information_schema.columns c ON t.table_name = c.table_name AND c.column_name = 'tenant_id'
LEFT JOIN pg_tables p ON t.table_name = p.tablename
LEFT JOIN pg_policies pol ON t.table_name = pol.tablename
WHERE t.table_schema = 'public' 
  AND t.table_name IN ('audits', 'event_outbox', 'monitoring_events', 'lineage_records')
GROUP BY t.table_name, c.column_name, p.rowsecurity
ORDER BY t.table_name;