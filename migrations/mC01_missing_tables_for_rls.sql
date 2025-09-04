-- Missing tables for RLS compliance
-- Creates audits, event_outbox, qc_rules, qc_defects tables that are referenced in existing RLS policies
BEGIN;

-- audits table - For audit trail compliance
CREATE TABLE IF NOT EXISTS audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  action text NOT NULL,
  user_id uuid,
  user_email text,
  changes jsonb,
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- event_outbox table - For reliable event publishing
CREATE TABLE IF NOT EXISTS event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  aggregate_id uuid NOT NULL,
  aggregate_type text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- qc_rules table - Quality control rules
CREATE TABLE IF NOT EXISTS qc_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  rule_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  conditions jsonb NOT NULL,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- qc_defects table - Quality control defects found during processing
CREATE TABLE IF NOT EXISTS qc_defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL,
  rule_id uuid NOT NULL REFERENCES qc_rules(id) ON DELETE CASCADE,
  defect_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  description text NOT NULL,
  field_name text,
  expected_value text,
  actual_value text,
  status text DEFAULT 'open',
  resolved_at timestamp with time zone,
  resolved_by uuid,
  resolution_notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_audits_tenant_target ON audits(tenant_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audits_created_at ON audits(created_at);
CREATE INDEX IF NOT EXISTS idx_event_outbox_tenant_aggregate ON event_outbox(tenant_id, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_event_outbox_published ON event_outbox(published_at);
CREATE INDEX IF NOT EXISTS idx_qc_rules_active ON qc_rules(active);
CREATE INDEX IF NOT EXISTS idx_qc_defects_loan_id ON qc_defects(loan_id);
CREATE INDEX IF NOT EXISTS idx_qc_defects_rule_id ON qc_defects(rule_id);
CREATE INDEX IF NOT EXISTS idx_qc_defects_status ON qc_defects(status);

-- Add foreign key constraint for qc_defects to loan_candidates 
-- (assuming loan_candidates exists based on existing schema)
ALTER TABLE qc_defects 
  ADD CONSTRAINT qc_defects_loan_id_fkey 
  FOREIGN KEY (loan_id) REFERENCES loan_candidates(id) ON DELETE CASCADE;

COMMIT;