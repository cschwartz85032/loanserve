-- Migration: User Management System
-- Description: Core tables for role-based access control, authentication, and auditing
-- Author: System
-- Date: 2025-01-24

-- Note: Using gen_random_uuid() instead of uuid_generate_v4() for better compatibility
-- No extension needed as gen_random_uuid() is built-in to PostgreSQL

-- Create enum types
DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('invited', 'active', 'locked', 'suspended', 'disabled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE permission_level AS ENUM ('none', 'read', 'write', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE login_outcome AS ENUM ('succeeded', 'failed', 'locked');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Extend users table if it exists, or create it
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        CREATE TABLE users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email CITEXT NOT NULL UNIQUE,
            password_hash TEXT,
            status user_status NOT NULL DEFAULT 'active',
            last_login_at TIMESTAMPTZ,
            last_login_ip INET,
            failed_login_count INTEGER NOT NULL DEFAULT 0,
            password_updated_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        COMMENT ON TABLE users IS 'System users with authentication and status tracking';
        COMMENT ON COLUMN users.email IS 'Case-insensitive unique email address';
        COMMENT ON COLUMN users.password_hash IS 'Argon2id hashed password, null for SSO/invited users';
        COMMENT ON COLUMN users.status IS 'Current account status controlling access';
        COMMENT ON COLUMN users.failed_login_count IS 'Counter for lockout mechanism';
    ELSE
        -- Add columns if they don't exist
        ALTER TABLE users ADD COLUMN IF NOT EXISTS status user_status NOT NULL DEFAULT 'active';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip INET;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMPTZ;
    END IF;
END $$;

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_role_name CHECK (name IN ('admin', 'title', 'legal', 'lender', 'borrower', 'investor', 'regulator'))
);
COMMENT ON TABLE roles IS 'System roles defining access levels';
COMMENT ON COLUMN roles.name IS 'Role identifier, must be one of predefined values';

-- Create user_roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    PRIMARY KEY (user_id, role_id)
);
COMMENT ON TABLE user_roles IS 'Many-to-many relationship between users and roles';
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource TEXT NOT NULL,
    level permission_level NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(resource, level)
);
COMMENT ON TABLE permissions IS 'Available permissions for resources';
COMMENT ON COLUMN permissions.resource IS 'Resource name like Users, Loans, Payments, etc.';
COMMENT ON COLUMN permissions.level IS 'Access level for the resource';

-- Create role_permissions table
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    scope JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);
COMMENT ON TABLE role_permissions IS 'Permissions assigned to roles';
COMMENT ON COLUMN role_permissions.scope IS 'Optional attribute-based constraints for future use';
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);

-- Create user_ip_allowlist table
CREATE TABLE IF NOT EXISTS user_ip_allowlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    cidr CIDR NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, cidr)
);
COMMENT ON TABLE user_ip_allowlist IS 'IP address restrictions for users';
COMMENT ON COLUMN user_ip_allowlist.cidr IS 'IPv4 or IPv6 CIDR notation for allowed IPs';
CREATE INDEX IF NOT EXISTS idx_user_ip_allowlist_user_id ON user_ip_allowlist(user_id) WHERE is_active = true;

-- Create auth_events table (append-only audit log)
CREATE TABLE IF NOT EXISTS auth_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_user_id UUID REFERENCES users(id),
    target_user_id UUID REFERENCES users(id),
    event_type TEXT NOT NULL,
    ip INET,
    user_agent TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    event_key TEXT UNIQUE,
    CONSTRAINT valid_event_type CHECK (event_type IN (
        'user_created', 'user_updated', 'user_deleted',
        'role_assigned', 'role_revoked',
        'login_succeeded', 'login_failed', 
        'account_locked', 'account_unlocked',
        'password_reset_requested', 'password_reset_completed',
        'ip_allow_added', 'ip_allow_removed',
        'permission_matrix_changed', 'settings_changed',
        'session_created', 'session_revoked',
        'pii_unmasked'
    ))
);
COMMENT ON TABLE auth_events IS 'Immutable audit log for all authentication and authorization events';
COMMENT ON COLUMN auth_events.actor_user_id IS 'User performing the action, null for anonymous events';
COMMENT ON COLUMN auth_events.target_user_id IS 'User affected by the action';
COMMENT ON COLUMN auth_events.event_key IS 'Unique key for idempotency';
CREATE INDEX IF NOT EXISTS idx_auth_events_occurred_at ON auth_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_actor_user_id ON auth_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_target_user_id ON auth_events(target_user_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_event_type ON auth_events(event_type);

-- Create login_attempts table
CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    email_attempted CITEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip INET,
    user_agent TEXT,
    outcome login_outcome NOT NULL,
    reason TEXT
);
COMMENT ON TABLE login_attempts IS 'Login attempt tracking for rate limiting and forensics';
CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at ON login_attempts(attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip);

-- Create password_reset_tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, token_hash)
);
COMMENT ON TABLE password_reset_tokens IS 'Secure tokens for password reset flow';
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at) WHERE used_at IS NULL;

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip INET,
    user_agent TEXT,
    revoked_at TIMESTAMPTZ,
    revoke_reason TEXT
);
COMMENT ON TABLE sessions IS 'Active user sessions for session management';
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen_at ON sessions(last_seen_at DESC);

-- Create settings table for system configuration
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);
COMMENT ON TABLE system_settings IS 'System-wide configuration settings';

-- Insert base roles
INSERT INTO roles (name, description) VALUES
    ('admin', 'Platform administrator with full system access'),
    ('title', 'Title company with escrow management capabilities'),
    ('legal', 'Legal professional with compliance and audit focus'),
    ('lender', 'Loan originator and servicer'),
    ('borrower', 'Loan recipient with access to own records'),
    ('investor', 'Loan investor with access to own positions'),
    ('regulator', 'Regulatory body with read access and PII masking')
ON CONFLICT (name) DO NOTHING;

-- Insert resource permissions
WITH resources AS (
    SELECT unnest(ARRAY[
        'Users and Roles',
        'Loans', 
        'Payments and Allocations',
        'Escrow and Disbursements',
        'Investor Positions and Distributions',
        'Reports',
        'Settings',
        'Audit Logs'
    ]) AS resource
),
levels AS (
    SELECT unnest(enum_range(NULL::permission_level)) AS level
)
INSERT INTO permissions (resource, level)
SELECT r.resource, l.level
FROM resources r
CROSS JOIN levels l
ON CONFLICT (resource, level) DO NOTHING;

-- Setup default permission matrix
DO $$
DECLARE
    admin_role_id UUID;
    title_role_id UUID;
    legal_role_id UUID;
    lender_role_id UUID;
    borrower_role_id UUID;
    investor_role_id UUID;
    regulator_role_id UUID;
BEGIN
    -- Get role IDs
    SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';
    SELECT id INTO title_role_id FROM roles WHERE name = 'title';
    SELECT id INTO legal_role_id FROM roles WHERE name = 'legal';
    SELECT id INTO lender_role_id FROM roles WHERE name = 'lender';
    SELECT id INTO borrower_role_id FROM roles WHERE name = 'borrower';
    SELECT id INTO investor_role_id FROM roles WHERE name = 'investor';
    SELECT id INTO regulator_role_id FROM roles WHERE name = 'regulator';

    -- Admin: admin on all resources
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT admin_role_id, id FROM permissions WHERE level = 'admin'
    ON CONFLICT DO NOTHING;

    -- Title: read loans, read/write escrow, read reports
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT title_role_id, id FROM permissions 
    WHERE (resource = 'Loans' AND level = 'read')
       OR (resource = 'Escrow and Disbursements' AND level IN ('read', 'write'))
       OR (resource = 'Reports' AND level = 'read')
    ON CONFLICT DO NOTHING;

    -- Legal: read all, write compliance/audit
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT legal_role_id, id FROM permissions 
    WHERE level = 'read'
       OR (resource = 'Audit Logs' AND level = 'write')
    ON CONFLICT DO NOTHING;

    -- Lender: write loans/payments, read escrow/investor
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT lender_role_id, id FROM permissions 
    WHERE (resource IN ('Loans', 'Payments and Allocations') AND level IN ('read', 'write'))
       OR (resource IN ('Escrow and Disbursements', 'Investor Positions and Distributions') AND level = 'read')
    ON CONFLICT DO NOTHING;

    -- Borrower: read own loans and reports only
    INSERT INTO role_permissions (role_id, permission_id, scope)
    SELECT borrower_role_id, id, '{"own_records_only": true}'::jsonb 
    FROM permissions 
    WHERE resource IN ('Loans', 'Reports') AND level = 'read'
    ON CONFLICT DO NOTHING;

    -- Investor: read own positions and distributions only
    INSERT INTO role_permissions (role_id, permission_id, scope)
    SELECT investor_role_id, id, '{"own_records_only": true}'::jsonb 
    FROM permissions 
    WHERE resource = 'Investor Positions and Distributions' AND level = 'read'
    ON CONFLICT DO NOTHING;

    -- Regulator: read all with PII masking, no Users/Settings
    INSERT INTO role_permissions (role_id, permission_id, scope)
    SELECT regulator_role_id, id, '{"pii_masked": true}'::jsonb 
    FROM permissions 
    WHERE level = 'read' 
      AND resource NOT IN ('Users and Roles', 'Settings')
    ON CONFLICT DO NOTHING;
END $$;

-- Insert default system settings
INSERT INTO system_settings (key, value, description) VALUES
    ('LOCKOUT_THRESHOLD', '5'::jsonb, 'Number of failed login attempts before account lockout'),
    ('LOCKOUT_WINDOW_MINUTES', '15'::jsonb, 'Time window in minutes for counting failed attempts'),
    ('LOCKOUT_AUTO_UNLOCK_MINUTES', '30'::jsonb, 'Minutes before automatic unlock, null to disable'),
    ('PASSWORD_RESET_EXPIRY_MINUTES', '60'::jsonb, 'Minutes before password reset token expires'),
    ('LOGIN_RATE_LIMIT_PER_IP', '{"requests": 10, "window_seconds": 60}'::jsonb, 'Rate limit per IP address'),
    ('LOGIN_RATE_LIMIT_PER_EMAIL', '{"requests": 5, "window_seconds": 300}'::jsonb, 'Rate limit per email address'),
    ('REGULATOR_PII_MASKING', 'true'::jsonb, 'Enable PII masking for regulator role')
ON CONFLICT (key) DO NOTHING;

-- Create update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['users', 'roles', 'user_ip_allowlist', 'system_settings'])
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON %s', t, t);
        EXECUTE format('CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
    END LOOP;
END $$;

-- Add helpful indexes for common queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status) WHERE status != 'disabled';
CREATE INDEX IF NOT EXISTS idx_auth_events_composite ON auth_events(event_type, occurred_at DESC);

-- Migration completion
DO $$
BEGIN
    RAISE NOTICE 'User Management System migration completed successfully';
END $$;