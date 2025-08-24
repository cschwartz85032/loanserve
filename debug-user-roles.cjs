const { Pool } = require('pg');

async function checkUserRoles() {
  let connectionString = process.env.DATABASE_URL;
  if (connectionString && connectionString.includes('sslmode=requir')) {
    connectionString = connectionString.replace('sslmode=requir', 'sslmode=require');
  }
  
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Check if user_roles table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'user_roles'
      );
    `);
    
    console.log('user_roles table exists:', tableCheck.rows[0].exists);
    
    if (tableCheck.rows[0].exists) {
      // Get columns of user_roles table
      const columns = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'user_roles'
        ORDER BY ordinal_position;
      `);
      
      console.log('\nColumns in user_roles table:');
      console.log('===========================');
      columns.rows.forEach(col => {
        console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
    }
    
    // Also check roles table
    const rolesCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'roles'
      );
    `);
    
    console.log('\nroles table exists:', rolesCheck.rows[0].exists);
    
    if (rolesCheck.rows[0].exists) {
      const rolesColumns = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'roles'
        ORDER BY ordinal_position;
      `);
      
      console.log('\nColumns in roles table:');
      console.log('======================');
      rolesColumns.rows.forEach(col => {
        console.log(`${col.column_name}: ${col.data_type}`);
      });
    }
    
    // Check current user's role from users table
    console.log('\nChecking users table role column:');
    const userRole = await pool.query(`
      SELECT id, username, role 
      FROM users 
      WHERE username = 'testauth' 
      LIMIT 1
    `);
    
    if (userRole.rows.length > 0) {
      console.log('User role from users table:', userRole.rows[0].role);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkUserRoles();
