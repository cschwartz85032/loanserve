-- CRITICAL: This migration MUST run first to prevent uuid_generate_v4() errors
-- For Neon database compatibility - uses built-in gen_random_uuid() instead

-- Drop ALL auth-related tables to prevent conflicts
DROP TABLE IF EXISTS auth_events CASCADE;
DROP TABLE IF EXISTS login_attempts CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS user_ip_allowlist CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- Test that gen_random_uuid() works (built-in to PostgreSQL)
DO $$
BEGIN
  PERFORM gen_random_uuid();
  RAISE NOTICE 'gen_random_uuid() is available and working';
END $$;