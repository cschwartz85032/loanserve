-- Step 21: Public Developer API, OAuth, API Keys & Rate Limits
-- Provides secure external APIs with OAuth2 Client Credentials and API key management

BEGIN;

-- API clients for OAuth2 Client Credentials flow
CREATE TABLE IF NOT EXISTS api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id text UNIQUE NOT NULL,
  client_name text NOT NULL,
  client_secret_hash text NOT NULL,         -- bcrypt/argon hash
  scopes text[] NOT NULL DEFAULT ARRAY['read'],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- API keys for HMAC authentication
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  label text NOT NULL,
  key_id text UNIQUE NOT NULL,
  key_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Rate limiting buckets (sliding window)
CREATE TABLE IF NOT EXISTS api_rate (
  tenant_id uuid NOT NULL,
  key_id text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, key_id, window_start)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_api_clients_tenant 
ON api_clients (tenant_id, active);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant 
ON api_keys (tenant_id, active, expires_at);

CREATE INDEX IF NOT EXISTS idx_api_rate_window 
ON api_rate (window_start);

-- Clean up old rate limiting windows (for maintenance)
-- Note: Index predicate removed due to immutable function requirement

COMMIT;