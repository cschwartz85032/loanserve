-- Migration C05: Enforce NOT NULL on tenant columns
-- Addresses: Weak constraints allowing NULL tenant_ids
-- NON-NEGOTIABLE: Required for tenant isolation guarantees

BEGIN;

-- Enforce tenant_id NOT NULL where applicable
-- Only apply to tables that definitely should have tenant isolation

-- Core AI pipeline tables - these MUST have tenant_id
DO $$
BEGIN
  -- loan_candidates - central table, must have tenant
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loan_candidates' AND column_name = 'tenant_id' AND is_nullable = 'YES') THEN
    -- Backfill any NULL values with a default tenant (should not exist in practice)
    UPDATE loan_candidates SET tenant_id = '00000000-0000-0000-0000-000000000000'::uuid WHERE tenant_id IS NULL;
    ALTER TABLE loan_candidates ALTER COLUMN tenant_id SET NOT NULL;
  END IF;

  -- imports - must have tenant context
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'imports' AND column_name = 'tenant_id' AND is_nullable = 'YES') THEN
    UPDATE imports SET tenant_id = '00000000-0000-0000-0000-000000000000'::uuid WHERE tenant_id IS NULL;
    ALTER TABLE imports ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END$$;

-- Add NOT NULL constraints on audit tables tenant_id columns added in previous migration
DO $$
BEGIN
  -- audits table - enforce tenant context for compliance
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audits' AND column_name = 'tenant_id' AND is_nullable = 'YES') THEN
    -- Only set NOT NULL if we have tenant_id populated for all rows
    IF NOT EXISTS (SELECT 1 FROM audits WHERE tenant_id IS NULL LIMIT 1) THEN
      ALTER TABLE audits ALTER COLUMN tenant_id SET NOT NULL;
    END IF;
  END IF;

  -- event_outbox table - enforce tenant context for message isolation
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_outbox' AND column_name = 'tenant_id' AND is_nullable = 'YES') THEN
    IF NOT EXISTS (SELECT 1 FROM event_outbox WHERE tenant_id IS NULL LIMIT 1) THEN
      ALTER TABLE event_outbox ALTER COLUMN tenant_id SET NOT NULL;
    END IF;
  END IF;
END$$;

-- Add validation constraints to ensure tenant_id format is valid UUID
ALTER TABLE loan_candidates 
  ADD CONSTRAINT chk_loan_candidates_tenant_uuid 
  CHECK (tenant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

ALTER TABLE imports 
  ADD CONSTRAINT chk_imports_tenant_uuid 
  CHECK (tenant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- Add constraints for audit tables if they have tenant_id columns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audits' AND column_name = 'tenant_id') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_audits_tenant_uuid') THEN
      EXECUTE $$ALTER TABLE audits ADD CONSTRAINT chk_audits_tenant_uuid CHECK (tenant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')$$;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_outbox' AND column_name = 'tenant_id') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_event_outbox_tenant_uuid') THEN
      EXECUTE $$ALTER TABLE event_outbox ADD CONSTRAINT chk_event_outbox_tenant_uuid CHECK (tenant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')$$;
    END IF;
  END IF;
END$$;

-- Add indexes for tenant-based queries (performance optimization)
CREATE INDEX IF NOT EXISTS idx_loan_candidates_tenant_id ON loan_candidates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_imports_tenant_id ON imports(tenant_id);

-- Conditional indexes for audit tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audits' AND column_name = 'tenant_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audits_tenant_id ON audits(tenant_id)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_outbox' AND column_name = 'tenant_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_event_outbox_tenant_id ON event_outbox(tenant_id)';
  END IF;
END$$;

COMMIT;

-- Verification: Check NOT NULL constraints are in place
SELECT 
  table_name,
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_name IN ('loan_candidates', 'imports', 'audits', 'event_outbox')
  AND column_name = 'tenant_id'
ORDER BY table_name;