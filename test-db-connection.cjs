const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function testConnection() {
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', ['loanatik']);
    console.log('User found:', result.rows.length > 0 ? 'Yes' : 'No');
    if (result.rows.length > 0) {
      console.log('Username:', result.rows[0].username);
      console.log('Email:', result.rows[0].email);
      console.log('Role:', result.rows[0].role);
    }
  } catch (error) {
    console.error('Database error:', error);
  } finally {
    await pool.end();
  }
}

testConnection();
