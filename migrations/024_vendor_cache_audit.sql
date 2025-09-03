-- Step 20: External Vendor Integrations Database Tables
-- Provides caching and audit for UCDP/SSR, Flood, Title, and HOI vendor calls

BEGIN;

-- Vendor response cache with TTL
CREATE TABLE IF NOT EXISTS vendor_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id uuid NULL,
  vendor text NOT NULL,                -- UCDP|FLOOD|TITLE|HOI
  key text NOT NULL,                   -- e.g., "SSR:<appraisal_id>", "FLOOD:<address_hash>"
  payload jsonb NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (tenant_id, vendor, key)
);

-- Index for efficient cache lookups
CREATE INDEX IF NOT EXISTS idx_vendor_cache_lookup 
ON vendor_cache (tenant_id, vendor, key, expires_at);

-- Comprehensive vendor audit trail
CREATE TABLE IF NOT EXISTS vendor_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id uuid NULL,
  vendor text NOT NULL,
  endpoint text NOT NULL,
  status integer NOT NULL,
  req jsonb NOT NULL,
  res jsonb NULL,
  latency_ms integer NOT NULL,
  ts timestamptz NOT NULL DEFAULT now()
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_vendor_audit_lookup 
ON vendor_audit (tenant_id, vendor, ts DESC);

-- Index for loan-specific vendor calls
CREATE INDEX IF NOT EXISTS idx_vendor_audit_loan 
ON vendor_audit (loan_id, ts DESC);

COMMIT;