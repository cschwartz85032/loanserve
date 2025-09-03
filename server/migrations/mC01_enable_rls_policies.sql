-- Migration C01: Enable RLS & tenant policies on all multi-tenant tables
-- Addresses: Cross-tenant read risk, inconsistent RLS enforcement
-- NON-NEGOTIABLE: Required for regulatory compliance

BEGIN;

-- Enable RLS on all multi-tenant tables
ALTER TABLE IF EXISTS loan_candidates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS loan_documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS loan_datapoints          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS loan_conflicts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS imports                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS import_errors            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS import_mappings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS qc_rules                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS qc_defects               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audits                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS event_outbox             ENABLE ROW LEVEL SECURITY;

-- If these helper tables exist, protect them too (safe if not found):
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='monitoring_events') THEN
    EXECUTE 'ALTER TABLE monitoring_events ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pipeline_alerts') THEN
    EXECUTE 'ALTER TABLE pipeline_alerts ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='worker_status') THEN
    EXECUTE 'ALTER TABLE worker_status ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='lineage_records') THEN
    EXECUTE 'ALTER TABLE lineage_records ENABLE ROW LEVEL SECURITY';
  END IF;
END$$;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS p_lc_tenant ON loan_candidates;
DROP POLICY IF EXISTS p_ld_tenant ON loan_documents;
DROP POLICY IF EXISTS p_ldp_tenant ON loan_datapoints;
DROP POLICY IF EXISTS p_lconf_tenant ON loan_conflicts;
DROP POLICY IF EXISTS p_imp_tenant ON imports;
DROP POLICY IF EXISTS p_impe_tenant ON import_errors;
DROP POLICY IF EXISTS p_impm_tenant ON import_mappings;
DROP POLICY IF EXISTS p_qcr_tenant ON qc_rules;
DROP POLICY IF EXISTS p_qcd_tenant ON qc_defects;
DROP POLICY IF EXISTS p_aud_tenant ON audits;
DROP POLICY IF EXISTS p_outbox_tenant ON event_outbox;

-- Uniform tenant policy for read/write (using app.tenant_id)
CREATE POLICY p_lc_tenant     ON loan_candidates   USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY p_ld_tenant     ON loan_documents    USING (loan_id IN (SELECT id FROM loan_candidates WHERE tenant_id::text = current_setting('app.tenant_id', true)));
CREATE POLICY p_ldp_tenant    ON loan_datapoints   USING (loan_id IN (SELECT id FROM loan_candidates WHERE tenant_id::text = current_setting('app.tenant_id', true)));
CREATE POLICY p_lconf_tenant  ON loan_conflicts    USING (loan_id IN (SELECT id FROM loan_candidates WHERE tenant_id::text = current_setting('app.tenant_id', true)));
CREATE POLICY p_imp_tenant    ON imports           USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY p_impe_tenant   ON import_errors     USING (import_id IN (SELECT id FROM imports WHERE tenant_id::text = current_setting('app.tenant_id', true)));
CREATE POLICY p_impm_tenant   ON import_mappings   USING (import_id IN (SELECT id FROM imports WHERE tenant_id::text = current_setting('app.tenant_id', true)));
CREATE POLICY p_qcr_tenant    ON qc_rules          USING (true);  -- rules are global in practice; allow read under app.tenant_id session
CREATE POLICY p_qcd_tenant    ON qc_defects        USING (loan_id IN (SELECT id FROM loan_candidates WHERE tenant_id::text = current_setting('app.tenant_id', true)));
CREATE POLICY p_aud_tenant    ON audits            USING ((metadata->>'tenant_id')::text = current_setting('app.tenant_id', true));
CREATE POLICY p_outbox_tenant ON event_outbox      USING ((payload->>'tenant_id')::text = current_setting('app.tenant_id', true));

-- Helper table policies (safe if tables don't exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='monitoring_events') THEN
    EXECUTE $$DROP POLICY IF EXISTS p_mon_tenant ON monitoring_events$$;
    EXECUTE $$CREATE POLICY p_mon_tenant ON monitoring_events USING ((dim->>'tenant_id')::text = current_setting('app.tenant_id', true))$$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pipeline_alerts') THEN
    EXECUTE $$DROP POLICY IF EXISTS p_alerts_tenant ON pipeline_alerts$$;
    EXECUTE $$CREATE POLICY p_alerts_tenant ON pipeline_alerts USING (true)$$; -- Global alerts for now
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='worker_status') THEN
    EXECUTE $$DROP POLICY IF EXISTS p_worker_tenant ON worker_status$$;
    EXECUTE $$CREATE POLICY p_worker_tenant ON worker_status USING (true)$$; -- Global worker status
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='lineage_records') THEN
    EXECUTE $$DROP POLICY IF EXISTS p_lineage_tenant ON lineage_records$$;
    EXECUTE $$CREATE POLICY p_lineage_tenant ON lineage_records USING ((metadata->>'tenant_id')::text = current_setting('app.tenant_id', true))$$;
  END IF;
END$$;

COMMIT;

-- Verification: Ensure RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('loan_candidates', 'loan_documents', 'loan_datapoints', 'loan_conflicts', 'imports', 'import_errors', 'import_mappings', 'qc_rules', 'qc_defects', 'audits', 'event_outbox')
  AND rowsecurity = true;