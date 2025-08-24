#!/usr/bin/env node

/**
 * Verify Policy Engine Functionality
 * 
 * Tests that the optimized policy engine correctly resolves permissions
 */

const { Client } = require('pg');

async function testPolicyEngine(client, userId) {
  // Test the actual optimized query from the policy engine
  const roleIdsResult = await client.query(`
    SELECT role_id FROM user_roles WHERE user_id = $1
  `, [userId]);
  
  const roleIds = roleIdsResult.rows.map(r => r.role_id);
  
  if (roleIds.length === 0) {
    return { permissions: [] };
  }
  
  const result = await client.query(`
    WITH merged_permissions AS (
      SELECT 
        p.resource,
        MAX(CASE 
          WHEN p.level = 'admin' THEN 3
          WHEN p.level = 'write' THEN 2
          WHEN p.level = 'read' THEN 1
          ELSE 0
        END) as level_rank,
        CASE MAX(CASE 
          WHEN p.level = 'admin' THEN 3
          WHEN p.level = 'write' THEN 2
          WHEN p.level = 'read' THEN 1
          ELSE 0
        END)
          WHEN 3 THEN 'admin'
          WHEN 2 THEN 'write'
          WHEN 1 THEN 'read'
          ELSE 'none'
        END as level,
        COALESCE(
          jsonb_agg(rp.scope) FILTER (WHERE rp.scope IS NOT NULL),
          '[]'::jsonb
        ) as scopes
      FROM role_permissions rp
      INNER JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = ANY($1::uuid[])
      GROUP BY p.resource
    )
    SELECT 
      resource,
      level,
      CASE 
        WHEN scopes = '[]'::jsonb THEN NULL
        ELSE (
          SELECT jsonb_object_agg(key, value)
          FROM (
            SELECT DISTINCT ON (key) key, kv.value
            FROM jsonb_array_elements(scopes) AS elem
            CROSS JOIN LATERAL jsonb_each(elem) AS kv(key, value)
            ORDER BY key, kv.value DESC
          ) AS merged
        )
      END as scope
    FROM merged_permissions
    ORDER BY resource
  `, [roleIds]);
  
  return {
    permissions: result.rows
  };
}

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
    console.log('Connected to database\n');

    // Get test users
    const usersResult = await client.query(`
      SELECT DISTINCT 
        u.id, 
        u.username, 
        u.email,
        ARRAY_AGG(r.name) as role_names
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      GROUP BY u.id, u.username, u.email
      ORDER BY u.id
      LIMIT 5
    `);
    
    console.log('Testing Permission Resolution for Users:');
    console.log('========================================\n');
    
    for (const user of usersResult.rows) {
      console.log(`User: ${user.username} (ID: ${user.id})`);
      console.log(`Email: ${user.email}`);
      console.log(`Roles: ${user.role_names.filter(r => r).join(', ') || 'None'}`);
      
      const policy = await testPolicyEngine(client, user.id);
      
      if (policy.permissions.length === 0) {
        console.log('Permissions: None');
      } else {
        console.log('Permissions:');
        policy.permissions.forEach(perm => {
          const scopeStr = perm.scope ? ` (scope: ${JSON.stringify(perm.scope)})` : '';
          console.log(`  - ${perm.resource}: ${perm.level}${scopeStr}`);
        });
      }
      console.log('');
    }

    // Test specific scenarios
    console.log('\nQuery Statistics:');
    console.log('=================');
    
    // Count total permissions in system
    const totalPermsResult = await client.query(`
      SELECT COUNT(*) as count FROM permissions
    `);
    console.log(`Total permissions defined: ${totalPermsResult.rows[0].count}`);
    
    // Count role-permission assignments
    const rolePermsResult = await client.query(`
      SELECT COUNT(*) as count FROM role_permissions
    `);
    console.log(`Total role-permission assignments: ${rolePermsResult.rows[0].count}`);
    
    // Count users with roles
    const usersWithRolesResult = await client.query(`
      SELECT COUNT(DISTINCT user_id) as count FROM user_roles
    `);
    console.log(`Users with assigned roles: ${usersWithRolesResult.rows[0].count}`);
    
    // Check for scope usage
    const scopeUsageResult = await client.query(`
      SELECT COUNT(*) as count FROM role_permissions WHERE scope IS NOT NULL
    `);
    console.log(`Role-permissions with custom scopes: ${scopeUsageResult.rows[0].count}`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);