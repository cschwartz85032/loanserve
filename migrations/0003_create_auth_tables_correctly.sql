-- Create authentication and authorization tables with gen_random_uuid()
-- This migration creates all auth-related tables correctly for Neon compatibility

-- Create auth_events table with correct UUID function
CREATE TABLE IF NOT EXISTS auth_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_user_id INTEGER,
    target_user_id INTEGER,
    event_type TEXT NOT NULL,
    ip INET,
    user_agent TEXT,
    details JSONB DEFAULT '{}'::jsonb NOT NULL,
    event_key TEXT UNIQUE,
    CONSTRAINT valid_event_type CHECK (
        event_type IN (
            'user_created', 'user_updated', 'user_deleted',
            'role_assigned', 'role_revoked',
            'login_succeeded', 'login_failed',
            'account_locked', 'account_unlocked',
            'password_reset_requested', 'password_reset_completed',
            'ip_allow_added', 'ip_allow_removed',
            'permission_matrix_changed', 'settings_changed',
            'session_created', 'session_revoked',
            'pii_unmasked', 'permission_granted',
            'permission_denied', 'api_request'
        )
    )
);

-- Create indexes for auth_events
CREATE INDEX IF NOT EXISTS idx_auth_events_occurred_at ON auth_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_auth_events_actor_user_id ON auth_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_target_user_id ON auth_events(target_user_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_event_type ON auth_events(event_type);

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource TEXT NOT NULL,
    level TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(resource, level)
);

-- Create role_permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    scope JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

-- Create user_roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
    user_id INTEGER NOT NULL,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by INTEGER,
    PRIMARY KEY (user_id, role_id)
);

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip INET,
    user_agent TEXT,
    revoked_at TIMESTAMPTZ,
    revoke_reason TEXT
);

-- Create password_reset_tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    consumed_at TIMESTAMPTZ
);

-- Create login_attempts table
CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER,
    email TEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'locked'))
);

-- Create user_ip_allowlist table
CREATE TABLE IF NOT EXISTS user_ip_allowlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL,
    cidr INET NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    added_by INTEGER,
    expires_at TIMESTAMPTZ,
    begin_date DATE
);

-- Insert default roles
INSERT INTO roles (name, description) VALUES
    ('admin', 'Full system access'),
    ('lender', 'Lender access'),
    ('borrower', 'Borrower access'),
    ('investor', 'Investor access'),
    ('title', 'Title company access'),
    ('legal', 'Legal department access'),
    ('regulator', 'Regulatory access')
ON CONFLICT (name) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at ON login_attempts(attempted_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_user_ip_allowlist_user_id ON user_ip_allowlist(user_id) WHERE is_active;