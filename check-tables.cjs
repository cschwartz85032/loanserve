const { Pool } = require('pg');

async function checkTables() {
  let connectionString = process.env.DATABASE_URL;
  if (connectionString && connectionString.includes('sslmode=requir')) {
    connectionString = connectionString.replace('sslmode=requir', 'sslmode=require');
  }
  
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Check sessions table
    console.log('SESSIONS TABLE:');
    console.log('===============');
    const sessionsColumns = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'sessions'
      ORDER BY ordinal_position;
    `);
    
    sessionsColumns.rows.forEach(col => {
      console.log(`${col.column_name}: ${col.data_type}`);
    });
    
    // Check login_attempts table
    console.log('\nLOGIN_ATTEMPTS TABLE:');
    console.log('=====================');
    const loginAttemptsColumns = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'login_attempts'
      ORDER BY ordinal_position;
    `);
    
    loginAttemptsColumns.rows.forEach(col => {
      console.log(`${col.column_name}: ${col.data_type}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTables();
