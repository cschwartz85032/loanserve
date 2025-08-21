// Script to set up users in production database
// Usage: node setup-prod-users.cjs "postgresql://user:password@host/database"

const { neon } = require('@neondatabase/serverless');
const argon2 = require('argon2');

const prodUrl = process.argv[2];

if (!prodUrl) {
  console.log(`
Usage: node setup-prod-users.cjs "postgresql://user:password@host/database"

You need to provide the production database URL as an argument.
This can be found in your Replit deployment settings or environment variables.

To get the production URL:
1. Go to your Replit deployment settings
2. Look for DATABASE_URL in the environment variables
3. Copy the full PostgreSQL connection string
`);
  process.exit(1);
}

const sql = neon(prodUrl);

async function setupProductionUsers() {
  console.log('Setting up users in PRODUCTION database...');
  console.log('Database host:', prodUrl.match(/@([^/]+)/)?.[1] || 'unknown');
  
  try {
    // Hash passwords
    const loanatikHash = await argon2.hash('loanatik');
    const adminHash = await argon2.hash('Admin123!@#$');
    
    // Check if loanatik user exists
    console.log('\nChecking for loanatik user...');
    const loanatikCheck = await sql`
      SELECT id, username, email, status 
      FROM users 
      WHERE username = 'loanatik'
    `;
    
    if (loanatikCheck.length > 0) {
      // Update existing user
      console.log('Found existing loanatik user, updating...');
      await sql`
        UPDATE users 
        SET password = ${loanatikHash},
            status = 'active',
            is_active = true,
            email = 'cschwartz@loanatik.com',
            first_name = 'Corey',
            last_name = 'Schwartz',
            role = 'lender'
        WHERE username = 'loanatik'
      `;
      console.log('✓ Updated loanatik user');
    } else {
      // Create new user
      console.log('Creating new loanatik user...');
      await sql`
        INSERT INTO users (
          username, email, password, role, status, 
          first_name, last_name, is_active
        ) VALUES (
          'loanatik', 'cschwartz@loanatik.com', ${loanatikHash}, 
          'lender', 'active', 'Corey', 'Schwartz', true
        )
      `;
      console.log('✓ Created loanatik user');
    }
    
    // Check if admin user exists
    console.log('\nChecking for admin user...');
    const adminCheck = await sql`
      SELECT id, username, email, status 
      FROM users 
      WHERE email = 'admin@loanserve.com'
    `;
    
    if (adminCheck.length > 0) {
      // Update existing admin
      console.log('Found existing admin user, updating...');
      await sql`
        UPDATE users 
        SET password = ${adminHash},
            status = 'active',
            is_active = true,
            username = 'admin',
            first_name = 'System',
            last_name = 'Administrator',
            role = 'admin'
        WHERE email = 'admin@loanserve.com'
      `;
      console.log('✓ Updated admin user');
    } else {
      // Create new admin
      console.log('Creating new admin user...');
      await sql`
        INSERT INTO users (
          username, email, password, role, status, 
          first_name, last_name, is_active
        ) VALUES (
          'admin', 'admin@loanserve.com', ${adminHash}, 
          'admin', 'active', 'System', 'Administrator', true
        )
      `;
      console.log('✓ Created admin user');
    }
    
    // Verify users
    console.log('\n=== PRODUCTION USERS READY ===');
    console.log('\n✓ loanatik / loanatik');
    console.log('  Email: cschwartz@loanatik.com');
    console.log('  Role: lender');
    console.log('\n✓ admin@loanserve.com / Admin123!@#$');
    console.log('  Username: admin');
    console.log('  Role: admin');
    console.log('\n================================');
    console.log('\nUsers are now set up in production!');
    console.log('You can log in at https://readysetclose.com');
    
  } catch (error) {
    console.error('\nError setting up users:', error.message);
    console.error('Details:', error);
    process.exit(1);
  }
}

setupProductionUsers().catch(console.error);