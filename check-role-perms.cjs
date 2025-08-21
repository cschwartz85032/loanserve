const { Pool } = require('pg');

async function checkRolePermissions() {
  let connectionString = process.env.DATABASE_URL;
  if (connectionString && connectionString.includes('sslmode=requir')) {
    connectionString = connectionString.replace('sslmode=requir', 'sslmode=require');
  }
  
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Check if role_permissions table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'role_permissions'
      );
    `);
    
    console.log('role_permissions table exists:', tableCheck.rows[0].exists);
    
    if (tableCheck.rows[0].exists) {
      // Get columns of role_permissions table
      const columns = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'role_permissions'
        ORDER BY ordinal_position;
      `);
      
      console.log('\nColumns in role_permissions table:');
      console.log('===================================');
      columns.rows.forEach(col => {
        console.log(`${col.column_name}: ${col.data_type}`);
      });
      
      // Check if it has permission_id or permission column
      const hasPermissionId = columns.rows.some(c => c.column_name === 'permission_id');
      const hasPermission = columns.rows.some(c => c.column_name === 'permission');
      
      console.log('\nColumn analysis:');
      console.log(`Has permission_id: ${hasPermissionId}`);
      console.log(`Has permission: ${hasPermission}`);
      
      // Try to query some data
      if (hasPermission) {
        console.log('\nSample data (using permission column):');
        const sample = await pool.query(`
          SELECT role_id, permission, resource 
          FROM role_permissions 
          LIMIT 3
        `);
        sample.rows.forEach(row => {
          console.log(`  Role: ${row.role_id}, Permission: ${row.permission}, Resource: ${row.resource}`);
        });
      }
    } else {
      console.log('Table does not exist');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkRolePermissions();
