-- V1_1__phase9_seed.sql
-- Seed data for compliance system

INSERT INTO retention_policy (data_class, jurisdiction, min_retention_days, max_retention_days, policy_version)
VALUES 
  ('FIN.TXN','US', 2555, 3650, '2025.09.01'),
  ('PII.ID','US', 1825, 2555, '2025.09.01'),
  ('DOC.APPRAISAL','US', 1095, NULL, '2025.09.01'),
  ('DOC.DISCLOSURE','US', 1095, 1825, '2025.09.01'),
  ('AUDIT.LOG','US', 2555, NULL, '2025.09.01')
ON CONFLICT DO NOTHING;

INSERT INTO process_timer (timer_code, jurisdiction, window_hours_min, window_hours_max, grace_hours, version)
VALUES 
  ('NOTICE.PRIVACY.ANNUAL','US', 0, 8760, 168, '2025.09.01'),
  ('NOTICE.ADVERSE.ACTION','US', 0, 720, 24, '2025.09.01'),
  ('NOTICE.ESCROW.ANALYSIS','US', 0, 720, 72, '2025.09.01'),
  ('CONSENT.RENEWAL','US', 8400, 8760, 360, '2025.09.01'),
  ('DSAR.RESPONSE','US', 0, 720, 0, '2025.09.01')
ON CONFLICT DO NOTHING;