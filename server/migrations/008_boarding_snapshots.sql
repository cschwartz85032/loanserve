BEGIN;
CREATE TABLE IF NOT EXISTS boarding_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  snapshot_hash text NOT NULL,      -- sha256 over canonical datapoints + docset hash
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_boarding_snapshots_loan ON boarding_snapshots(tenant_id, loan_id, created_at DESC);
COMMIT;