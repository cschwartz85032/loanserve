const { Pool } = require('pg');
const argon2 = require('argon2');

async function testAuthSystem() {
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
    console.log('Creating test user for authentication testing...\n');
    
    const testEmail = 'testauth@example.com';
    const testUsername = 'testauth';
    const testPassword = 'TestPassword123!';
    
    // First, delete the test user if it exists
    await pool.query(`
      DELETE FROM users WHERE email = $1 OR username = $2
    `, [testEmail, testUsername]);
    
    // Hash the password
    const hashedPassword = await argon2.hash(testPassword);
    
    // Create the test user
    const result = await pool.query(`
      INSERT INTO users (username, email, password, first_name, last_name, role, is_active, email_verified)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, username, email
    `, [testUsername, testEmail, hashedPassword, 'Test', 'User', 'admin', true, true]);
    
    const user = result.rows[0];
    console.log('✅ Test user created successfully!');
    console.log('=====================================');
    console.log(`ID: ${user.id}`);
    console.log(`Username: ${testUsername}`);
    console.log(`Email: ${testEmail}`);
    console.log(`Password: ${testPassword}`);
    console.log('=====================================\n');
    
    // Now test the login
    console.log('Testing login with the test user...\n');
    
    const fetch = require('node-fetch');
    
    // Test login with username
    console.log('1. Testing login with username...');
    const loginResponse1 = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUsername,  // The field is called email but accepts username too
        password: testPassword
      })
    });
    
    const loginResult1 = await loginResponse1.json();
    
    if (loginResponse1.ok && loginResult1.success) {
      console.log('✅ Login with username successful!');
      console.log(`   Session ID: ${loginResult1.sessionId}`);
      console.log(`   User ID: ${loginResult1.user.id}`);
    } else {
      console.log('❌ Login with username failed:', loginResult1.error);
    }
    
    // Test login with email
    console.log('\n2. Testing login with email...');
    const loginResponse2 = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword
      })
    });
    
    const loginResult2 = await loginResponse2.json();
    
    if (loginResponse2.ok && loginResult2.success) {
      console.log('✅ Login with email successful!');
      console.log(`   Session ID: ${loginResult2.sessionId}`);
      console.log(`   User ID: ${loginResult2.user.id}`);
    } else {
      console.log('❌ Login with email failed:', loginResult2.error);
    }
    
    // Check sessions table
    console.log('\n3. Checking sessions table...');
    const sessionsResult = await pool.query(`
      SELECT id, sid, user_id, created_at, expire
      FROM sessions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 5
    `, [user.id]);
    
    console.log(`   Found ${sessionsResult.rows.length} session(s) for test user`);
    if (sessionsResult.rows.length > 0) {
      console.log('   Latest session:');
      const session = sessionsResult.rows[0];
      console.log(`   - Session ID: ${session.id}`);
      console.log(`   - SID: ${session.sid}`);
      console.log(`   - Expires: ${session.expire}`);
    }
    
    console.log('\n=====================================');
    console.log('Authentication system test complete!');
    console.log('=====================================');
    
  } catch (error) {
    console.error('Error during testing:', error);
  } finally {
    await pool.end();
  }
}

testAuthSystem();