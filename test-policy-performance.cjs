#!/usr/bin/env node

/**
 * Test Policy Engine Performance
 * 
 * Measures the performance of the optimized policy engine
 * to verify the elimination of N+1 queries.
 */

const { Client } = require('pg');

async function measureQueryPerformance(client, userId) {
  const startTime = Date.now();
  
  // Simulate the optimized policy engine query
  const result = await client.query(`
    WITH user_role_ids AS (
      SELECT role_id 
      FROM user_roles 
      WHERE user_id = $1
    ),
    merged_permissions AS (
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
      WHERE rp.role_id IN (SELECT role_id FROM user_role_ids)
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
  `, [userId]);
  
  const endTime = Date.now();
  return {
    duration: endTime - startTime,
    rowCount: result.rowCount
  };
}

async function measureOldApproach(client, userId) {
  const startTime = Date.now();
  
  // Step 1: Get user's roles
  const rolesResult = await client.query(`
    SELECT ur.role_id, r.name
    FROM user_roles ur
    INNER JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = $1
  `, [userId]);
  
  // Step 2: Get permissions for all roles (single query, not N+1)
  const roleIds = rolesResult.rows.map(r => r.role_id);
  let permissions = [];
  
  if (roleIds.length > 0) {
    const permsResult = await client.query(`
      SELECT p.resource, p.level, rp.scope
      FROM role_permissions rp
      INNER JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = ANY($1::uuid[])
    `, [roleIds]);
    
    permissions = permsResult.rows;
  }
  
  // Step 3: Merge permissions in JavaScript
  const merged = new Map();
  for (const perm of permissions) {
    const existing = merged.get(perm.resource);
    if (!existing || perm.level > existing.level) {
      merged.set(perm.resource, perm);
    }
  }
  
  const endTime = Date.now();
  return {
    duration: endTime - startTime,
    rowCount: merged.size
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

    // Get a test user with roles
    const userResult = await client.query(`
      SELECT DISTINCT u.id, u.username, COUNT(ur.role_id) as role_count
      FROM users u
      INNER JOIN user_roles ur ON u.id = ur.user_id
      GROUP BY u.id, u.username
      LIMIT 1
    `);
    
    if (userResult.rows.length === 0) {
      console.log('No users with roles found for testing');
      return;
    }
    
    const testUser = userResult.rows[0];
    console.log(`Testing with user: ${testUser.username} (ID: ${testUser.id}, Roles: ${testUser.role_count})\n`);

    // Warm up the database connection
    await measureQueryPerformance(client, testUser.id);
    await measureOldApproach(client, testUser.id);

    // Run performance tests
    const iterations = 10;
    let optimizedTotal = 0;
    let oldTotal = 0;

    console.log('Running performance tests...\n');

    for (let i = 0; i < iterations; i++) {
      const optimized = await measureQueryPerformance(client, testUser.id);
      const old = await measureOldApproach(client, testUser.id);
      
      optimizedTotal += optimized.duration;
      oldTotal += old.duration;
      
      console.log(`Iteration ${i + 1}:`);
      console.log(`  Optimized: ${optimized.duration}ms (${optimized.rowCount} permissions)`);
      console.log(`  Old approach: ${old.duration}ms (${old.rowCount} permissions)`);
    }

    const avgOptimized = optimizedTotal / iterations;
    const avgOld = oldTotal / iterations;
    const improvement = ((avgOld - avgOptimized) / avgOld * 100).toFixed(1);

    console.log('\n=== Performance Summary ===');
    console.log(`Average optimized query time: ${avgOptimized.toFixed(2)}ms`);
    console.log(`Average old approach time: ${avgOld.toFixed(2)}ms`);
    console.log(`Performance improvement: ${improvement}%`);
    
    if (avgOptimized < avgOld) {
      console.log('✓ Optimized query is faster!');
    } else {
      console.log('⚠ Old approach might be faster for this dataset');
    }

    // Check query plan
    console.log('\n=== Query Execution Plan ===');
    const explainResult = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS) 
      WITH user_role_ids AS (
        SELECT role_id FROM user_roles WHERE user_id = $1
      ),
      merged_permissions AS (
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
          END as level
        FROM role_permissions rp
        INNER JOIN permissions p ON rp.permission_id = p.id
        WHERE rp.role_id IN (SELECT role_id FROM user_role_ids)
        GROUP BY p.resource
      )
      SELECT * FROM merged_permissions
    `, [testUser.id]);
    
    console.log('Key execution details:');
    explainResult.rows.forEach(row => {
      if (row['QUERY PLAN'].includes('Nested Loop') || 
          row['QUERY PLAN'].includes('Hash Join') || 
          row['QUERY PLAN'].includes('Execution Time')) {
        console.log('  ' + row['QUERY PLAN']);
      }
    });

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);