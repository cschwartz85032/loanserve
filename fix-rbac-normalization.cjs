#!/usr/bin/env node

/**
 * Fix RBAC Normalization Script
 * 
 * This script ensures the role_permissions table is properly normalized
 * to match the migration 0009_user_management_system_fixed.sql
 * 
 * The normalized structure uses:
 * - role_id (UUID) referencing roles.id
 * - permission_id (UUID) referencing permissions.id
 * - scope (JSONB) for optional constraints
 * - Composite primary key (role_id, permission_id)
 */

const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }
  
  const client = new Client({
    connectionString: connectionString,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Check if the table structure is already normalized
    const checkResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'role_permissions'
      ORDER BY ordinal_position
    `);
    
    const columns = checkResult.rows.map(row => row.column_name);
    console.log('Current role_permissions columns:', columns);

    // Check if we have the denormalized structure (id, role_id, resource, permission)
    const hasDenormalizedStructure = columns.includes('id') && 
                                     columns.includes('resource') && 
                                     columns.includes('permission');
    
    // Check if we have the normalized structure (role_id, permission_id, scope)
    const hasNormalizedStructure = columns.includes('permission_id') && 
                                   !columns.includes('resource') && 
                                   !columns.includes('permission');

    if (hasNormalizedStructure) {
      console.log('✓ Table already has normalized structure');
      return;
    }

    if (hasDenormalizedStructure) {
      console.log('Found denormalized structure, migrating to normalized...');
      
      // Begin transaction
      await client.query('BEGIN');

      try {
        // 1. Create a temporary table with normalized structure
        await client.query(`
          CREATE TEMP TABLE role_permissions_new (
            role_id UUID NOT NULL,
            permission_id UUID NOT NULL,
            scope JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (role_id, permission_id),
            FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
            FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
          )
        `);
        console.log('Created temporary table with normalized structure');

        // 2. Migrate data from denormalized to normalized
        const migrationResult = await client.query(`
          INSERT INTO role_permissions_new (role_id, permission_id, scope, created_at)
          SELECT 
            rp.role_id,
            p.id as permission_id,
            NULL::jsonb as scope,
            COALESCE(rp.created_at, NOW()) as created_at
          FROM role_permissions rp
          JOIN permissions p ON p.resource = rp.resource 
            AND p.level = rp.permission::permission_level
          ON CONFLICT DO NOTHING
        `);
        console.log(`Migrated ${migrationResult.rowCount} permission assignments`);

        // 3. Drop the old table
        await client.query('DROP TABLE role_permissions CASCADE');
        console.log('Dropped old denormalized table');

        // 4. Create the new normalized table
        await client.query(`
          CREATE TABLE role_permissions (
            role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
            scope JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (role_id, permission_id)
          )
        `);
        console.log('Created new normalized table');

        // 5. Create indexes
        await client.query('CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id)');
        console.log('Created indexes');

        // 6. Copy data from temp table
        const copyResult = await client.query(`
          INSERT INTO role_permissions 
          SELECT * FROM role_permissions_new
        `);
        console.log(`Copied ${copyResult.rowCount} records to new table`);

        // Commit transaction
        await client.query('COMMIT');
        console.log('✓ Successfully migrated to normalized structure');
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } else {
      console.log('Table structure is unclear, manual inspection required');
      console.log('Columns found:', columns);
    }

    // Verify final structure
    const finalCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'role_permissions'
      ORDER BY ordinal_position
    `);
    console.log('\nFinal table structure:');
    finalCheck.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    // Check data
    const countResult = await client.query('SELECT COUNT(*) FROM role_permissions');
    console.log(`\nTotal role_permissions records: ${countResult.rows[0].count}`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);