const { Pool } = require('pg');

async function checkRoles() {
  let connectionString = process.env.DATABASE_URL;
  if (connectionString && connectionString.includes('sslmode=requir')) {
    connectionString = connectionString.replace('sslmode=requir', 'sslmode=require');
  }
  
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Checking roles in database...\n');
    
    // Check roles table
    const roles = await pool.query(`
      SELECT id, name, description
      FROM roles
      ORDER BY name
    `);
    
    console.log('Roles found:', roles.rows.length);
    console.log('=====================================');
    
    if (roles.rows.length === 0) {
      console.log('No roles found in the database!');
      console.log('\nNeed to insert default roles...');
    } else {
      roles.rows.forEach(role => {
        console.log(`Name: ${role.name}`);
        console.log(`ID: ${role.id}`);
        console.log(`Description: ${role.description || 'No description'}`);
        console.log('-------------------------------------');
      });
    }
    
    // Check if we need to create missing roles
    const expectedRoles = ['admin', 'lender', 'borrower', 'investor', 'escrow_officer', 'legal', 'servicer'];
    const existingRoleNames = roles.rows.map(r => r.name);
    const missingRoles = expectedRoles.filter(r => !existingRoleNames.includes(r));
    
    if (missingRoles.length > 0) {
      console.log('\nMissing roles that need to be created:');
      missingRoles.forEach(r => console.log(`  - ${r}`));
    } else {
      console.log('\nAll expected roles are present.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkRoles();
