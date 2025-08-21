#!/usr/bin/env node

/**
 * Diagnostic script to check user authentication
 */

const { neon } = require('@neondatabase/serverless');
const argon2 = require('argon2');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function checkUser(username) {
  console.log(`\n🔍 Checking user: ${username}`);
  
  try {
    // Find user by username
    const users = await sql`
      SELECT id, username, email, password, is_active, locked_until, email_verified, failed_login_attempts
      FROM users 
      WHERE username = ${username}
    `;
    
    if (users.length === 0) {
      console.log('❌ User not found');
      
      // Check if it exists as email
      const byEmail = await sql`
        SELECT id, username, email 
        FROM users 
        WHERE email = ${username}
      `;
      
      if (byEmail.length > 0) {
        console.log(`ℹ️  Found user with email ${username}: username is "${byEmail[0].username}"`);
      }
      
      // List all usernames
      const allUsers = await sql`
        SELECT id, username, email, created_at 
        FROM users 
        ORDER BY created_at DESC 
        LIMIT 10
      `;
      
      console.log('\n📋 Recent users in database:');
      for (const u of allUsers) {
        console.log(`  - ${u.username} (${u.email}) - ID: ${u.id}`);
      }
      
      return;
    }
    
    const user = users[0];
    console.log(`✅ User found: ID ${user.id}, Email: ${user.email}`);
    console.log(`   Active: ${user.is_active ? 'Yes' : 'No'}`);
    console.log(`   Email Verified: ${user.email_verified ? 'Yes' : 'No'}`);
    console.log(`   Failed Login Attempts: ${user.failed_login_attempts || 0}`);
    
    if (user.locked_until) {
      const lockTime = new Date(user.locked_until);
      if (lockTime > new Date()) {
        console.log(`   🔒 LOCKED until: ${lockTime.toISOString()}`);
      } else {
        console.log(`   🔓 Lock expired at: ${lockTime.toISOString()}`);
      }
    }
    
    // Check user roles
    const roles = await sql`
      SELECT r.name, r.id
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ${user.id}
    `;
    
    if (roles.length > 0) {
      console.log(`   Roles: ${roles.map(r => r.name).join(', ')}`);
    } else {
      console.log('   ⚠️  No roles assigned');
    }
    
    // Test password verification if provided
    const testPassword = process.argv[3];
    if (testPassword && user.password) {
      console.log(`\n🔐 Testing password...`);
      try {
        const isValid = await argon2.verify(user.password, testPassword);
        if (isValid) {
          console.log('✅ Password is correct!');
        } else {
          console.log('❌ Password is incorrect');
        }
      } catch (err) {
        console.log('❌ Error verifying password:', err.message);
      }
    } else if (testPassword) {
      console.log('⚠️  User has no password set');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Get username from command line
const username = process.argv[2];

if (!username) {
  console.log('Usage: node check-user-auth.cjs <username> [password]');
  console.log('Example: node check-user-auth.cjs loanserve mypassword');
  process.exit(1);
}

checkUser(username).then(() => {
  console.log('\n✅ Done');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});