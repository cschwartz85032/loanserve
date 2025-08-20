const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function addLocalhostToAllowlist() {
  try {
    // First get the user ID for loanatik
    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', ['loanatik']);
    if (userResult.rows.length === 0) {
      console.log('User loanatik not found');
      return;
    }
    
    const userId = userResult.rows[0].id;
    console.log('User ID:', userId);
    
    // Add localhost to IP allowlist
    const result = await pool.query(`
      INSERT INTO user_ip_allowlist (user_id, cidr, label, is_active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (user_id, cidr) DO UPDATE SET is_active = true
      RETURNING *
    `, [userId, '127.0.0.1/32', 'Localhost - Development']);
    
    if (result.rows.length > 0) {
      console.log('Added/updated localhost in IP allowlist for user loanatik');
      console.log('Entry:', result.rows[0]);
    }
    
    // List all active IP allowlist entries for this user
    const listResult = await pool.query('SELECT * FROM user_ip_allowlist WHERE user_id = $1 AND is_active = true', [userId]);
    console.log('\nActive IP allowlist entries for user:', listResult.rows);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

addLocalhostToAllowlist();
