-- Prepare database for UUID support without extensions
-- This migration runs early to ensure compatibility with Neon database
-- It prevents uuid_generate_v4() errors by ensuring tables don't exist

-- Drop any tables that might have been created with wrong UUID function
DROP TABLE IF EXISTS auth_events CASCADE;
DROP TABLE IF EXISTS login_attempts CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS user_ip_allowlist CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- Ensure we're using the built-in gen_random_uuid() function
-- No extension needed as this is built into PostgreSQL 13+
SELECT gen_random_uuid() AS test_uuid_generation;

-- Create a dummy table to test UUID generation works
CREATE TEMPORARY TABLE uuid_test (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY
);

-- Insert a test row to verify UUID generation
INSERT INTO uuid_test DEFAULT VALUES;

-- Clean up test table
DROP TABLE uuid_test;

-- Migration successful - gen_random_uuid() is working