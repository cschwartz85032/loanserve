-- Add MFA tables for Multi-Factor Authentication

-- MFA factors for users (TOTP, SMS, etc.)
CREATE TABLE IF NOT EXISTS user_mfa_factors (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  factor_type TEXT NOT NULL CHECK (factor_type IN ('totp', 'sms', 'email')),
  factor_name TEXT NOT NULL,
  -- TOTP specific fields
  totp_secret TEXT,
  totp_issuer TEXT DEFAULT 'LoanServe Pro',
  totp_algorithm TEXT DEFAULT 'SHA1',
  totp_digits INTEGER DEFAULT 6,
  totp_period INTEGER DEFAULT 30,
  -- SMS/Email specific fields
  phone_number TEXT,
  email_address TEXT,
  -- Verification status
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMP,
  last_used_at TIMESTAMP,
  -- Device trust
  trusted_devices JSONB DEFAULT '[]',
  -- Metadata
  enrolled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enrolled_ip TEXT,
  enrolled_user_agent TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS user_mfa_factors_user_id_idx ON user_mfa_factors(user_id);
CREATE INDEX IF NOT EXISTS user_mfa_factors_factor_type_idx ON user_mfa_factors(factor_type);
CREATE INDEX IF NOT EXISTS user_mfa_factors_active_idx ON user_mfa_factors(is_active);

-- MFA backup codes
CREATE TABLE IF NOT EXISTS mfa_backup_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMP,
  used_ip TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS mfa_backup_codes_user_id_idx ON mfa_backup_codes(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS mfa_backup_codes_code_hash_idx ON mfa_backup_codes(code_hash);

-- MFA challenges (pending MFA verifications)
CREATE TABLE IF NOT EXISTS mfa_challenges (
  id SERIAL PRIMARY KEY,
  challenge_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id TEXT,
  factor_id INTEGER REFERENCES user_mfa_factors(id),
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('login', 'step_up', 'enrollment')),
  -- Challenge details
  action TEXT,
  required_factors INTEGER DEFAULT 1,
  completed_factors INTEGER DEFAULT 0,
  -- Rate limiting
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  last_attempt_at TIMESTAMP,
  locked_until TIMESTAMP,
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed', 'expired')),
  verified_at TIMESTAMP,
  -- Metadata
  ip TEXT,
  user_agent TEXT,
  device_fingerprint TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS mfa_challenges_challenge_id_idx ON mfa_challenges(challenge_id);
CREATE INDEX IF NOT EXISTS mfa_challenges_user_id_idx ON mfa_challenges(user_id);
CREATE INDEX IF NOT EXISTS mfa_challenges_status_idx ON mfa_challenges(status);
CREATE INDEX IF NOT EXISTS mfa_challenges_expires_at_idx ON mfa_challenges(expires_at);

-- MFA audit log for tracking all MFA events
CREATE TABLE IF NOT EXISTS mfa_audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  factor_id INTEGER REFERENCES user_mfa_factors(id),
  challenge_id TEXT REFERENCES mfa_challenges(challenge_id),
  event_type TEXT NOT NULL,
  event_details JSONB DEFAULT '{}',
  ip TEXT,
  user_agent TEXT,
  device_fingerprint TEXT,
  success BOOLEAN NOT NULL,
  failure_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS mfa_audit_log_user_id_idx ON mfa_audit_log(user_id);
CREATE INDEX IF NOT EXISTS mfa_audit_log_event_type_idx ON mfa_audit_log(event_type);
CREATE INDEX IF NOT EXISTS mfa_audit_log_created_at_idx ON mfa_audit_log(created_at);

-- Add MFA-related columns to users table if they don't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS require_mfa_for_sensitive BOOLEAN DEFAULT true;