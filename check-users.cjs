const { Pool } = require('pg');

async function checkUsers() {
  // Fix DATABASE_URL if needed
  let connectionString = process.env.DATABASE_URL;
  if (connectionString && connectionString.includes('sslmode=requir')) {
    connectionString = connectionString.replace('sslmode=requir', 'sslmode=require');
  }
  
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Checking users in database...\n');
    
    const result = await pool.query(`
      SELECT id, username, email, role, is_active, email_verified, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log('Users found:', result.rows.length);
    console.log('=====================================\n');
    
    result.rows.forEach(user => {
      console.log(`ID: ${user.id}`);
      console.log(`Username: ${user.username}`);
      console.log(`Email: ${user.email}`);
      console.log(`Role: ${user.role}`);
      console.log(`Active: ${user.is_active}`);
      console.log(`Email Verified: ${user.email_verified}`);
      console.log(`Created: ${user.created_at}`);
      console.log('-------------------------------------');
    });
    
    console.log('\nTo login, use the username or email with the correct password.');
    console.log('Note: The login endpoint accepts either username OR email.');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkUsers();
