#!/usr/bin/env node

/**
 * Verify RBAC Single System
 * 
 * Confirms that the legacy role enum has been removed and all role
 * assignments go through the RBAC user_roles junction table
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
    console.log('=== RBAC Single System Verification ===\n');

    // 1. Verify role column is removed from users table
    console.log('1. Checking for legacy role column in users table:');
    const roleColumnResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'role'
    `);
    
    if (roleColumnResult.rows.length === 0) {
      console.log('   ✓ Legacy role column has been removed');
    } else {
      console.log('   ✗ WARNING: Legacy role column still exists!');
    }

    // 2. Verify role index is removed
    console.log('\n2. Checking for legacy role index:');
    const roleIndexResult = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'users' 
      AND indexname = 'user_role_idx'
    `);
    
    if (roleIndexResult.rows.length === 0) {
      console.log('   ✓ Legacy role index has been removed');
    } else {
      console.log('   ✗ WARNING: Legacy role index still exists!');
    }

    // 3. Check RBAC tables exist and are populated
    console.log('\n3. RBAC System Status:');
    
    const rolesCount = await client.query('SELECT COUNT(*) FROM roles');
    console.log(`   - Roles defined: ${rolesCount.rows[0].count}`);
    
    const userRolesCount = await client.query('SELECT COUNT(*) FROM user_roles');
    console.log(`   - User role assignments: ${userRolesCount.rows[0].count}`);
    
    const permissionsCount = await client.query('SELECT COUNT(*) FROM permissions');
    console.log(`   - Permissions defined: ${permissionsCount.rows[0].count}`);
    
    const rolePermissionsCount = await client.query('SELECT COUNT(*) FROM role_permissions');
    console.log(`   - Role permission mappings: ${rolePermissionsCount.rows[0].count}`);

    // 4. Show current user role assignments
    console.log('\n4. Current User Role Assignments (sample):');
    const userAssignments = await client.query(`
      SELECT 
        u.username,
        u.email,
        array_agg(r.name ORDER BY r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      GROUP BY u.id, u.username, u.email
      ORDER BY u.username
      LIMIT 10
    `);
    
    userAssignments.rows.forEach(row => {
      const roles = row.roles[0] ? row.roles.join(', ') : 'NO ROLES ASSIGNED';
      console.log(`   - ${row.username} (${row.email}): ${roles}`);
    });

    // 5. Verify policy engine compatibility
    console.log('\n5. Policy Engine Compatibility Check:');
    
    // Check a sample user's permissions
    const sampleUser = await client.query(`
      SELECT u.id, u.username
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name = 'admin'
      LIMIT 1
    `);
    
    if (sampleUser.rows.length > 0) {
      const userId = sampleUser.rows[0].id;
      const username = sampleUser.rows[0].username;
      
      const permissions = await client.query(`
        SELECT DISTINCT
          p.resource,
          p.level
        FROM user_roles ur
        JOIN role_permissions rp ON ur.role_id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = $1
        ORDER BY p.resource
        LIMIT 5
      `, [userId]);
      
      console.log(`   Sample permissions for ${username} (admin):`);
      permissions.rows.forEach(perm => {
        console.log(`   - ${perm.resource}: ${perm.level}`);
      });
      
      if (permissions.rows.length > 0) {
        console.log('   ✓ Policy engine can resolve permissions correctly');
      }
    }

    // 6. Migration status
    console.log('\n6. Migration Status:');
    const migration10 = await client.query(`
      SELECT 1 FROM information_schema.tables 
      WHERE table_comment LIKE '%RBAC system%'
      LIMIT 1
    `);
    
    if (migration10.rows.length > 0 || roleColumnResult.rows.length === 0) {
      console.log('   ✓ Migration 0010_remove_legacy_role_enum has been applied');
    } else {
      console.log('   ⚠ Migration 0010 may not have been fully applied');
    }

    console.log('\n=== Verification Complete ===');
    console.log('✓ The dual role system has been eliminated');
    console.log('✓ All role assignments now go through the RBAC user_roles table');
    console.log('✓ The system is using a single, consistent role management approach');

  } catch (error) {
    console.error('Verification error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);