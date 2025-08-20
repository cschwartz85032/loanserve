const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function removeLocalhostFromAllowlist() {
  try {
    // Remove localhost from IP allowlist for user loanatik
    const result = await pool.query(`
      DELETE FROM user_ip_allowlist 
      WHERE user_id = 1 AND cidr = '127.0.0.1/32'
      RETURNING *
    `);
    
    if (result.rows.length > 0) {
      console.log('Removed localhost from IP allowlist');
    }
    
    // Test login still works
    console.log('\nTesting login from localhost (not in allowlist)...');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

removeLocalhostFromAllowlist();
