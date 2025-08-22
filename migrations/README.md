# Database Migrations

This directory contains database migration files for the LoanServe Pro application.

## Migration Order

Migrations are applied in numerical order based on their prefix:
- `0000_comprehensive-schema.sql` - Base schema
- `0001_tiresome_luckman.sql` - Initial updates
- `0006_add_escrow_disbursement_tables.sql` - Escrow disbursement features
- `0007_add_escrow_disbursement_fields.sql` - Additional escrow fields
- `0009_user_management_system_fixed.sql` - RBAC and user management (authoritative)
- `0028_add_notice_templates.sql` - Notice template system

## Important Notes

### Superseded Migrations
The following migrations have been superseded and should NOT be run:
- `0008_user_management_system.sql.superseded` - Replaced by 0009 (fixed version with proper cleanup)

### Migration 0009 Details
Migration `0009_user_management_system_fixed.sql` is the authoritative version for user management:
- Includes proper cleanup of any partial migrations
- Uses integer user IDs consistently
- Implements normalized RBAC structure with UUID role/permission IDs
- Creates proper audit tables with foreign key relationships

### Running Migrations
Migrations are automatically applied on application startup using Drizzle ORM.
The system tracks applied migrations in the `meta/_journal.json` file.

### Creating New Migrations
When creating new migrations:
1. Use the next sequential number
2. Include descriptive names
3. Make migrations idempotent (use IF NOT EXISTS, etc.)
4. Test thoroughly in development before production deployment

## Current Schema Status
As of 2025-08-22:
- Sessions table: Audit-enabled structure with user tracking
- RBAC: Normalized structure with role_permissions junction table
- Authentication: Enhanced with MFA support and password policies