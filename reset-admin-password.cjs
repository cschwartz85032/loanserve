#!/usr/bin/env node

/**
 * Reset admin user password
 */

const { neon } = require('@neondatabase/serverless');
const argon2 = require('argon2');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function resetAdminPassword() {
  const newPassword = 'Admin123!';
  
  try {
    // Hash the new password
    const hashedPassword = await argon2.hash(newPassword);
    
    // Update admin user password
    const result = await sql`
      UPDATE users 
      SET 
        password = ${hashedPassword},
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
      WHERE username = 'admin'
      RETURNING id, username, email
    `;
    
    if (result.length === 0) {
      console.log('❌ Admin user not found');
      
      // Check if there's any user with admin role
      const adminUsers = await sql`
        SELECT u.id, u.username, u.email 
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        JOIN roles r ON ur.role_id = r.id
        WHERE r.name = 'admin'
      `;
      
      if (adminUsers.length > 0) {
        console.log('\n📋 Users with admin role:');
        for (const u of adminUsers) {
          console.log(`  - ${u.username} (${u.email})`);
        }
        console.log('\nRun: node reset-admin-password.cjs <username> to reset their password');
      }
      return;
    }
    
    console.log(`✅ Password reset successfully for user: ${result[0].username}`);
    console.log(`   Email: ${result[0].email}`);
    console.log(`   New Password: ${newPassword}`);
    
  } catch (error) {
    console.error('Error resetting password:', error);
  }
}

// Check if a specific username is provided
const username = process.argv[2];

async function resetSpecificUser(username, password = 'Admin123!') {
  try {
    const hashedPassword = await argon2.hash(password);
    
    const result = await sql`
      UPDATE users 
      SET 
        password = ${hashedPassword},
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
      WHERE username = ${username}
      RETURNING id, username, email
    `;
    
    if (result.length === 0) {
      console.log(`❌ User "${username}" not found`);
      return;
    }
    
    console.log(`✅ Password reset successfully for user: ${result[0].username}`);
    console.log(`   Email: ${result[0].email}`);
    console.log(`   New Password: ${password}`);
    
  } catch (error) {
    console.error('Error resetting password:', error);
  }
}

if (username) {
  const password = process.argv[3] || 'Admin123!';
  resetSpecificUser(username, password).then(() => {
    console.log('\n✅ Done');
    process.exit(0);
  });
} else {
  resetAdminPassword().then(() => {
    console.log('\n✅ Done');
    process.exit(0);
  });
}