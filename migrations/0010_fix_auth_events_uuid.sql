-- Fix auth_events table to use gen_random_uuid() instead of uuid_generate_v4()
-- This migration ensures compatibility with Neon database

-- Drop the table if it exists with wrong UUID function
DROP TABLE IF EXISTS auth_events CASCADE;

-- Recreate auth_events table with gen_random_uuid()
CREATE TABLE auth_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_user_id INTEGER REFERENCES users(id),
    target_user_id INTEGER REFERENCES users(id),
    event_type TEXT NOT NULL,
    ip INET,
    user_agent TEXT,
    details JSONB DEFAULT '{}'::jsonb NOT NULL,
    event_key TEXT UNIQUE,
    CONSTRAINT valid_event_type CHECK (
        event_type = ANY (ARRAY[
            'user_created'::text, 'user_updated'::text, 'user_deleted'::text,
            'role_assigned'::text, 'role_revoked'::text,
            'login_succeeded'::text, 'login_failed'::text,
            'account_locked'::text, 'account_unlocked'::text,
            'password_reset_requested'::text, 'password_reset_completed'::text,
            'ip_allow_added'::text, 'ip_allow_removed'::text,
            'permission_matrix_changed'::text, 'settings_changed'::text,
            'session_created'::text, 'session_revoked'::text,
            'pii_unmasked'::text, 'permission_granted'::text,
            'permission_denied'::text, 'api_request'::text
        ])
    )
);

-- Create indexes
CREATE INDEX idx_auth_events_occurred_at ON auth_events(occurred_at);
CREATE INDEX idx_auth_events_actor_user_id ON auth_events(actor_user_id);
CREATE INDEX idx_auth_events_target_user_id ON auth_events(target_user_id);
CREATE INDEX idx_auth_events_event_type ON auth_events(event_type);

-- Add comment
COMMENT ON TABLE auth_events IS 'Comprehensive audit log for authentication and authorization events';