-- Migration: Remove Legacy Role Enum
-- Description: Removes the legacy role enum column from users table in favor of RBAC system
-- Author: System
-- Date: 2025-08-22

-- Drop the index on the role column if it exists
DROP INDEX IF EXISTS user_role_idx;

-- Drop the role column from users table
-- This column is deprecated in favor of the user_roles junction table
ALTER TABLE users DROP COLUMN IF EXISTS role;

-- Add comment explaining the role system
COMMENT ON TABLE user_roles IS 'User role assignments using RBAC system. This replaces the legacy role enum column.';

-- Note: The user_role enum type is still used by other tables, so we're not dropping it yet
-- It may be referenced in historical data or audit logs