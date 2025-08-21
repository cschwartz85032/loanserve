const { Pool } = require('pg');

async function checkIpAllowlist() {
  let connectionString = process.env.DATABASE_URL;
  if (connectionString && connectionString.includes('sslmode=requir')) {
    connectionString = connectionString.replace('sslmode=requir', 'sslmode=require');
  }
  
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Check if user_ip_allowlist table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'user_ip_allowlist'
      );
    `);
    
    console.log('user_ip_allowlist table exists:', tableCheck.rows[0].exists);
    
    if (tableCheck.rows[0].exists) {
      // Get columns of user_ip_allowlist table
      const columns = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'user_ip_allowlist'
        ORDER BY ordinal_position;
      `);
      
      console.log('\nColumns in user_ip_allowlist table:');
      console.log('=====================================');
      columns.rows.forEach(col => {
        console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
    } else {
      console.log('\nTable does not exist. Creating table based on schema...');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkIpAllowlist();
