const { Pool } = require('pg');
const argon2 = require('argon2');

async function hashPassword(password) {
  // Use Argon2id with the same config as auth-service.ts
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
    hashLength: 32,
  });
}

async function createAdminUser() {
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
    console.log('Creating admin user...\n');
    
    // Check if user already exists
    const existingCheck = await pool.query(`
      SELECT id, username, email FROM users 
      WHERE username = 'admin' OR email = 'admin@loanserve.com'
    `);
    
    if (existingCheck.rows.length > 0) {
      console.log('Admin user already exists:');
      console.log('Username:', existingCheck.rows[0].username);
      console.log('Email:', existingCheck.rows[0].email);
      console.log('\nUpdating password to: Admin123!');
      
      // Update the password
      const hashedPassword = await hashPassword('Admin123!');
      await pool.query(`
        UPDATE users 
        SET password = $1, updated_at = NOW()
        WHERE id = $2
      `, [hashedPassword, existingCheck.rows[0].id]);
      
      console.log('✅ Password updated successfully!');
    } else {
      // Create new admin user
      const hashedPassword = await hashPassword('Admin123!');
      
      const result = await pool.query(`
        INSERT INTO users (
          username, 
          email, 
          password, 
          first_name, 
          last_name,
          role,
          is_active,
          email_verified,
          created_at,
          updated_at
        ) VALUES (
          'admin',
          'admin@loanserve.com',
          $1,
          'System',
          'Administrator',
          'admin',
          true,
          true,
          NOW(),
          NOW()
        ) RETURNING id, username, email
      `, [hashedPassword]);
      
      console.log('✅ Admin user created successfully!');
      console.log('Username:', result.rows[0].username);
      console.log('Email:', result.rows[0].email);
      console.log('Password: Admin123!');
      
      // Also add the admin role to the user
      const user = result.rows[0];
      
      // Get the admin role ID (UUID)
      const roleResult = await pool.query(`
        SELECT id FROM roles WHERE name = 'admin'
      `);
      
      if (roleResult.rows.length > 0) {
        const adminRoleId = roleResult.rows[0].id;
        
        // Add user to admin role
        await pool.query(`
          INSERT INTO user_roles (user_id, role_id, created_at, updated_at)
          VALUES ($1, $2, NOW(), NOW())
          ON CONFLICT (user_id, role_id) DO NOTHING
        `, [user.id, adminRoleId]);
        
        console.log('✅ Admin role assigned to user');
      }
    }
    
    console.log('\n========================================');
    console.log('You can now login with:');
    console.log('Username: admin');
    console.log('Password: Admin123!');
    console.log('========================================\n');
    
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await pool.end();
  }
}

createAdminUser();