BEGIN;

-- Pipeline finalize lead time (per loan)
CREATE OR REPLACE VIEW vx_pipeline_lead_time AS
SELECT
  lc.tenant_id,
  lc.id AS loan_id,
  MIN(CASE WHEN e.type='loan.docs#uploaded' THEN e.ts END) AS uploaded_at,
  MIN(CASE WHEN e.type='loan.export#completed' THEN e.ts END) AS exported_at,
  EXTRACT(EPOCH FROM (MIN(CASE WHEN e.type='loan.export#completed' THEN e.ts END) -
                       MIN(CASE WHEN e.type='loan.docs#uploaded' THEN e.ts END))) / 86400.0 AS days_to_export
FROM loan_candidates lc
LEFT JOIN audits e ON e.target_id = lc.id
GROUP BY lc.tenant_id, lc.id;

-- QC MTTR (per defect)
CREATE OR REPLACE VIEW vx_qc_mttr AS
SELECT
  d.loan_id,
  r.code AS rule_code,
  r.severity,
  d.created_at,
  d.resolved_at,
  EXTRACT(EPOCH FROM (COALESCE(d.resolved_at, now()) - d.created_at)) / 3600.0 AS hours_to_resolve,
  d.status
FROM qc_defects d JOIN qc_rules r ON r.id = d.rule_id;

-- DNP savings per loan
CREATE OR REPLACE VIEW vx_dnp_savings AS
SELECT
  n.tenant_id,
  n.loan_id,
  COUNT(*) FILTER (WHERE n.status='suppressed' AND n.reason='DoNotPingPolicy') AS prevented_contacts
FROM notifications n
GROUP BY n.tenant_id, n.loan_id;

COMMIT;