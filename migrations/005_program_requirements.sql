-- QC System: Program Requirements Table
-- Stores program-specific requirements for loan datapoints (e.g., FNMA requires HOI)

BEGIN;

CREATE TABLE IF NOT EXISTS program_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_code text NOT NULL,         -- e.g., FNMA, FRE, PORTFOLIO
  key text NOT NULL,                  -- canonical datapoint key
  required boolean NOT NULL DEFAULT false,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE (program_code, key)
);

-- Add RLS policy for tenant isolation
ALTER TABLE program_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY program_requirements_tenant_isolation ON program_requirements
  USING (true);  -- Program requirements are global configuration

COMMIT;